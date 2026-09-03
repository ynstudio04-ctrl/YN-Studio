import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Wallet() {
  const [customers, setCustomers] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amount, setAmount] = useState("");

  const [addingMoney, setAddingMoney] = useState(false);

  /*
   * ---------------------------------------------------------
   * LOAD CUSTOMERS + WALLETS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    loadWallets();
  }, []);

  async function loadWallets() {
    try {
      setLoading(true);
      setError("");

      /*
       * Get all customers
       */
      const customerResponse = await fetch(
        `${API_URL}/customers`
      );

      if (!customerResponse.ok) {
        throw new Error("Failed to load customers");
      }

      const customerData = await customerResponse.json();

      /*
       * Get each customer's wallet
       *
       * Your backend already provides:
       * GET /wallet/:customerId
       */
      const walletData = await Promise.all(
        customerData.map(async (customer) => {
          try {
            const response = await fetch(
              `${API_URL}/wallet/${customer.id}`
            );

            if (!response.ok) {
              return {
                customer_id: customer.id,
                balance: 0,
              };
            }

            const wallet = await response.json();

            return {
              ...wallet,
              customer_id: customer.id,
            };
          } catch {
            return {
              customer_id: customer.id,
              balance: 0,
            };
          }
        })
      );

      setCustomers(customerData);
      setWallets(walletData);
    } catch (err) {
      console.error("LOAD WALLETS ERROR:", err);

      setError(
        err.message ||
          "Failed to load customer wallets."
      );
    } finally {
      setLoading(false);
    }
  }


  /*
   * ---------------------------------------------------------
   * COMBINE CUSTOMER + WALLET DATA
   * ---------------------------------------------------------
   */

  const customerWallets = useMemo(() => {
    return customers.map((customer) => {
      const wallet = wallets.find(
        (item) =>
          Number(item.customer_id) ===
          Number(customer.id)
      );

      return {
        ...customer,

        balance:
          Number(wallet?.balance) || 0,
      };
    });
  }, [customers, wallets]);


  /*
   * ---------------------------------------------------------
   * SEARCH
   * ---------------------------------------------------------
   */

  const filteredCustomers = useMemo(() => {
    const value = search
      .trim()
      .toLowerCase();

    if (!value) {
      return customerWallets;
    }

    return customerWallets.filter(
      (customer) =>
        customer.full_name
          ?.toLowerCase()
          .includes(value) ||
        customer.customer_code
          ?.toLowerCase()
          .includes(value)
    );
  }, [customerWallets, search]);


  /*
   * ---------------------------------------------------------
   * TOTAL BALANCE
   * ---------------------------------------------------------
   */

  const totalBalance = useMemo(() => {
    return customerWallets.reduce(
      (total, customer) =>
        total + Number(customer.balance || 0),
      0
    );
  }, [customerWallets]);


  /*
   * ---------------------------------------------------------
   * TRANSACTION TOTALS
   *
   * We load transactions for each customer so:
   *
   * Total Added
   * Total Deducted
   *
   * reflect actual wallet activity.
   * ---------------------------------------------------------
   */

  const [transactionTotals, setTransactionTotals] =
    useState({
      added: 0,
      deducted: 0,
    });

  useEffect(() => {
    if (!customers.length) {
      setTransactionTotals({
        added: 0,
        deducted: 0,
      });

      return;
    }

    loadTransactionTotals();
  }, [customers]);

  async function loadTransactionTotals() {
    try {
      const transactionLists =
        await Promise.all(
          customers.map(async (customer) => {
            try {
              const response = await fetch(
                `${API_URL}/wallet/${customer.id}/transactions`
              );

              if (!response.ok) {
                return [];
              }

              return await response.json();
            } catch {
              return [];
            }
          })
        );

      let added = 0;
      let deducted = 0;

      transactionLists
        .flat()
        .forEach((transaction) => {
          const value =
            Number(transaction.amount) || 0;

          if (value > 0) {
            added += value;
          }

          if (value < 0) {
            deducted += Math.abs(value);
          }
        });

      setTransactionTotals({
        added,
        deducted,
      });
    } catch (err) {
      console.error(
        "LOAD WALLET TRANSACTIONS ERROR:",
        err
      );
    }
  }


  /*
   * ---------------------------------------------------------
   * ADD MONEY
   * ---------------------------------------------------------
   */

  async function handleAddMoney() {
    if (!selectedCustomer) {
      alert("Please select a customer.");

      return;
    }

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      alert("Please enter a valid amount.");

      return;
    }

    try {
      setAddingMoney(true);

      const response = await fetch(
        `${API_URL}/wallet/${selectedCustomer.id}/add`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            amount: numericAmount,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to add money."
        );
      }

      /*
       * Close modal
       */
      setShowAddMoney(false);

      setAmount("");

      /*
       * Reload everything so the
       * dashboard immediately updates.
       */
      await loadWallets();

      await loadTransactionTotals();

      alert(
        `Successfully added $${numericAmount.toFixed(
          2
        )} to ${selectedCustomer.full_name}.`
      );
    } catch (err) {
      console.error(
        "ADD MONEY ERROR:",
        err
      );

      alert(
        err.message ||
          "Failed to add money."
      );
    } finally {
      setAddingMoney(false);
    }
  }


  /*
   * ---------------------------------------------------------
   * SELECT CUSTOMER
   * ---------------------------------------------------------
   */

  function openAddMoney(customer) {
    setSelectedCustomer(customer);

    setAmount("");

    setShowAddMoney(true);
  }


  /*
   * ---------------------------------------------------------
   * FORMAT MONEY
   * ---------------------------------------------------------
   */

  function money(value) {
    return `$${Number(value || 0).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  }


  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  return (
    <div className="wallet-page">

      {/* HEADER */}

      <div className="wallet-header">

        <div>
          <p className="wallet-eyebrow">
            FINANCE
          </p>

          <h1>Wallet</h1>

          <p>
            Manage customer balances and
            wallet transactions.
          </p>
        </div>

        <button
          className="wallet-add-btn"
          onClick={() => {
            if (!customerWallets.length) {
              alert(
                "There are no customers yet."
              );

              return;
            }

            setSelectedCustomer(
              customerWallets[0]
            );

            setAmount("");

            setShowAddMoney(true);
          }}
        >
          + Add Money
        </button>

      </div>


      {/* ERROR */}

      {error && (
        <div className="wallet-error">
          {error}
        </div>
      )}


      {/* SUMMARY */}

      <div className="wallet-summary">

        <div className="wallet-card wallet-balance-card">

          <div className="wallet-card-top">

            <span>
              Available Balance
            </span>

            <div className="wallet-icon">
              $
            </div>

          </div>

          <h2>
            {money(totalBalance)}
          </h2>

          <p>
            Current customer wallet balance
          </p>

        </div>


        <div className="wallet-card">

          <div className="wallet-card-top">

            <span>
              Total Added
            </span>

            <div className="wallet-icon">
              ＋
            </div>

          </div>

          <h2>
            {money(transactionTotals.added)}
          </h2>

          <p>
            Money added to wallets
          </p>

        </div>


        <div className="wallet-card">

          <div className="wallet-card-top">

            <span>
              Total Deducted
            </span>

            <div className="wallet-icon">
              −
            </div>

          </div>

          <h2>
            {money(
              transactionTotals.deducted
            )}
          </h2>

          <p>
            Money deducted from wallets
          </p>

        </div>

      </div>


      {/* CUSTOMER WALLETS */}

      <div className="wallet-section">

        <div className="wallet-section-header">

          <div>

            <h2>
              Customer Wallets
            </h2>

            <p>
              Select a customer to manage
              their balance.
            </p>

          </div>


          <div className="wallet-search">

            <input
              type="text"
              placeholder="Search customer..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>

        </div>


        {/* LOADING */}

        {loading ? (

          <div className="wallet-loading">

            <div className="wallet-spinner" />

            <span>
              Loading wallets...
            </span>

          </div>

        ) : filteredCustomers.length === 0 ? (

          /* EMPTY */

          <div className="wallet-empty">

            <div className="wallet-empty-icon">
              $
            </div>

            <h3>
              {search
                ? "No customers found"
                : "No customer wallets yet"}
            </h3>

            <p>
              {search
                ? "Try searching for another customer."
                : "Customer wallet balances will appear here."}
            </p>

          </div>

        ) : (

          /* CUSTOMER LIST */

          <div className="wallet-customer-list">

            {filteredCustomers.map(
              (customer) => (

                <div
                  className="wallet-customer-row"
                  key={customer.id}
                >

                  <div className="wallet-customer-avatar">

                    {customer.full_name
                      ?.charAt(0)
                      .toUpperCase()}

                  </div>


                  <div className="wallet-customer-info">

                    <div className="wallet-customer-name">
                      {customer.full_name}
                    </div>

                    <div className="wallet-customer-code">
                      {customer.customer_code}
                    </div>

                  </div>


                  <div className="wallet-customer-balance">

                    {money(
                      customer.balance
                    )}

                  </div>


                  <button
                    className="wallet-manage-btn"
                    onClick={() =>
                      openAddMoney(customer)
                    }
                  >
                    Add Money
                  </button>

                </div>

              )
            )}

          </div>

        )}

      </div>


      {/* =====================================================
          ADD MONEY MODAL
          ===================================================== */}

      {showAddMoney && (
        <div
          className="wallet-modal-overlay"
          onClick={() =>
            !addingMoney &&
            setShowAddMoney(false)
          }
        >

          <div
            className="wallet-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="wallet-modal-header">

              <div>

                <p>
                  WALLET MANAGEMENT
                </p>

                <h2>
                  Add Money
                </h2>

              </div>

              <button
                className="wallet-modal-close"
                onClick={() =>
                  setShowAddMoney(false)
                }
                disabled={addingMoney}
              >
                ×
              </button>

            </div>


            {selectedCustomer && (
              <div className="wallet-selected-customer">

                <div className="wallet-customer-avatar">
                  {selectedCustomer.full_name
                    ?.charAt(0)
                    .toUpperCase()}
                </div>

                <div>

                  <strong>
                    {selectedCustomer.full_name}
                  </strong>

                  <span>
                    {selectedCustomer.customer_code}
                  </span>

                </div>

              </div>
            )}


            <label>
              Amount
            </label>

            <div className="wallet-amount-input">

              <span>$</span>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value)
                }
                autoFocus
              />

            </div>


            <div className="wallet-modal-actions">

              <button
                className="wallet-cancel-btn"
                onClick={() =>
                  setShowAddMoney(false)
                }
                disabled={addingMoney}
              >
                Cancel
              </button>

              <button
                className="wallet-confirm-btn"
                onClick={handleAddMoney}
                disabled={addingMoney}
              >
                {addingMoney
                  ? "Adding..."
                  : "Add Money"}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default Wallet;