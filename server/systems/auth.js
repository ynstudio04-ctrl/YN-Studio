module.exports = function registerSystem({ app, ...shared }) {
  const {
    db,
    bcrypt,
    jwt,
    JWT_SECRET,
    paymentUpload,
    requestUpload,
    authenticateToken,
    generateCustomerCode,
    generateServiceCode,
    getToday,
    addDays,
    calculateNumberOfWeeks,
    calculateWeeklyInterest,
    createInterestSchedule,
    updateOverduePayments,
    generatePublicOrderNumber,
    ensureColumn,
  } = shared;


  app.post(
    "/api/auth/login",
    (req, res) => {
      try {
        const {
          username,
          password,
        } = req.body;
  
        if (
          !username ||
          !password
        ) {
          return res.status(400).json({
            message:
              "Username and password are required",
          });
        }
  
        const user = db
          .prepare(
            `
            SELECT *
            FROM users
            WHERE username = ?
          `
          )
          .get(username);
  
        if (!user) {
          return res.status(401).json({
            message:
              "Invalid username or password",
          });
        }
  
        const validPassword =
          bcrypt.compareSync(
            password,
            user.password
          );
  
        if (!validPassword) {
          return res.status(401).json({
            message:
              "Invalid username or password",
          });
        }
  
        const token =
          jwt.sign(
            {
              id: user.id,
              username:
                user.username,
            },
            JWT_SECRET,
            {
              expiresIn: "30d",
            }
          );
  
        res.json({
          success: true,
  
          token,
  
          user: {
            id: user.id,
            username:
              user.username,
          },
        });
      } catch (error) {
        console.error(
          "LOGIN ERROR:",
          error
        );
  
        res.status(500).json({
          message:
            "Login failed",
        });
      }
    }
  );

  app.post(
    "/api/customer/auth/register",
    (req, res) => {
      try {
        const {
          name,
          email,
          phone,
          password,
        } = req.body;
  
        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------
  
        if (
          !name ||
          !email ||
          !phone ||
          !password
        ) {
          return res.status(400).json({
            message:
              "Name, email, phone and password are required.",
          });
        }
  
        const cleanName = String(name).trim();
        const cleanEmail = String(email)
          .trim()
          .toLowerCase();
        const cleanPhone = String(phone).trim();
  
        if (cleanName.length < 2) {
          return res.status(400).json({
            message:
              "Name must contain at least 2 characters.",
          });
        }
  
        if (password.length < 6) {
          return res.status(400).json({
            message:
              "Password must contain at least 6 characters.",
          });
        }
  
        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
        if (!emailPattern.test(cleanEmail)) {
          return res.status(400).json({
            message:
              "Please provide a valid email address.",
          });
        }
  
        // ---------------------------------------------
        // CHECK EXISTING CUSTOMER
        // ---------------------------------------------
  
        const existingCustomer = db
          .prepare(
            `
            SELECT id
            FROM customers
            WHERE LOWER(email) = ?
          `
          )
          .get(cleanEmail);
  
        if (existingCustomer) {
          return res.status(409).json({
            message:
              "An account with this email already exists.",
          });
        }
  
        
  // ---------------------------------------------
  // CREATE RANDOM CUSTOMER CODE
  // ---------------------------------------------
  
  let customerCode;
  let codeExists = true;
  
  while (codeExists) {
    const randomNumber = Math.floor(
      100000 + Math.random() * 900000
    );
  
    customerCode = `YN-${randomNumber}`;
  
    const existingCode = db
      .prepare(
        `
        SELECT id
        FROM customers
        WHERE customer_code = ?
        `
      )
      .get(customerCode);
  
    codeExists = Boolean(existingCode);
  }
  
  
  
        // ---------------------------------------------
        // HASH PASSWORD
        // ---------------------------------------------
  
        const hashedPassword =
          bcrypt.hashSync(password, 10);
  
        // ---------------------------------------------
        // CREATE CUSTOMER
        // ---------------------------------------------
  
        const result = db
          .prepare(
            `
            INSERT INTO customers (
              customer_code,
              full_name,
              customer_type,
              phone,
              email,
              password
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            customerCode,
            cleanName,
            "registered",
            cleanPhone,
            cleanEmail,
            hashedPassword
          );
  
        // ---------------------------------------------
        // GET CREATED CUSTOMER
        // ---------------------------------------------
  
        const customer = db
          .prepare(
            `
            SELECT
              id,
              customer_code,
              full_name,
              customer_type,
              phone,
              email,
              created_at
            FROM customers
            WHERE id = ?
          `
          )
          .get(result.lastInsertRowid);
  
        // ---------------------------------------------
        // CREATE CUSTOMER TOKEN
        // ---------------------------------------------
  
        const token =
          jwt.sign(
            {
              id: customer.id,
              customerId: customer.id,
              type: "customer",
              email: customer.email,
            },
            JWT_SECRET,
            {
              expiresIn: "30d",
            }
          );
  
        // ---------------------------------------------
        // RESPONSE
        // ---------------------------------------------
  
        res.status(201).json({
          success: true,
          message:
            "Customer account created successfully.",
          token,
          customer,
        });
  
      } catch (error) {
        console.error(
          "CUSTOMER REGISTER ERROR:",
          error
        );
  
        res.status(500).json({
          message:
            "Unable to create customer account.",
        });
      }
    }
  );

  app.post(
    "/api/customer/auth/login",
    (req, res) => {
      try {
        const {
          email,
          password,
        } = req.body;
  
        if (
          !email ||
          !password
        ) {
          return res.status(400).json({
            message:
              "Email and password are required.",
          });
        }
  
        const cleanEmail = String(email)
          .trim()
          .toLowerCase();
  
        const customer = db
          .prepare(
            `
            SELECT *
            FROM customers
            WHERE LOWER(email) = ?
          `
          )
          .get(cleanEmail);
  
        if (!customer) {
          return res.status(401).json({
            message:
              "Invalid email or password.",
          });
        }
  
        if (!customer.password) {
          return res.status(401).json({
            message:
              "This customer account does not have a password.",
          });
        }
  
        const validPassword =
          bcrypt.compareSync(
            password,
            customer.password
          );
  
        if (!validPassword) {
          return res.status(401).json({
            message:
              "Invalid email or password.",
          });
        }
  
        const token =
          jwt.sign(
            {
              id: customer.id,
              customerId: customer.id,
              type: "customer",
              email: customer.email,
            },
            JWT_SECRET,
            {
              expiresIn: "30d",
            }
          );
  
        res.json({
          success: true,
  
          token,
  
          customer: {
            id: customer.id,
            customer_code:
              customer.customer_code,
            full_name:
              customer.full_name,
            customer_type:
              customer.customer_type,
            phone:
              customer.phone,
            email:
              customer.email,
            created_at:
              customer.created_at,
          },
        });
  
      } catch (error) {
        console.error(
          "CUSTOMER LOGIN ERROR:",
          error
        );
  
        res.status(500).json({
          message:
            "Customer login failed.",
        });
      }
    }
  );

  app.get(
    "/api/auth/me",
    authenticateToken,
    (req, res) => {
      try {
        const user = db
          .prepare(
            `
            SELECT
              id,
              username,
              created_at
            FROM users
            WHERE id = ?
          `
          )
          .get(req.user.id);
  
        if (!user) {
          return res.status(404).json({
            message:
              "User not found",
          });
        }
  
        res.json({
          success: true,
          user,
        });
      } catch (error) {
        console.error(
          "AUTH ME ERROR:",
          error
        );
  
        res.status(500).json({
          message:
            "Failed to load user",
        });
      }
    }
  );
};
