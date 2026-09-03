import { useEffect, useState } from "react";

import {
  Wallet,
  Receipt,
  ShoppingBag,
  ArrowLeft,
  Edit3,
  Phone,
  MapPin,
  Save,
  X,
  Ticket,
  Trash2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Plus,
  CreditCard,
  CalendarDays,
  Ban,
} from "lucide-react";

import { useParams, useNavigate } from "react-router-dom";

import AddMoneyModal from "../components/AddMoneyModal";

const API =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  // =====================================================
  // CUSTOMER
  // =====================================================

  const [customer, setCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerPaymentHistory, setCustomerPaymentHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  // =====================================================
  // WALLET
  // =====================================================

  const [wallet, setWallet] = useState({
    balance: 0,
  });

  const [transactions, setTransactions] = useState([]);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [deductOpen, setDeductOpen] = useState(false);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductDescription, setDeductDescription] = useState("");
  const [deductSaving, setDeductSaving] = useState(false);

  // =====================================================
  // LOAN
  // =====================================================

  const [loan, setLoan] = useState(null);

  const [loanModal, setLoanModal] = useState(false);

  const [loanAmount, setLoanAmount] = useState("");
  const [loanInterestType, setLoanInterestType] =
    useState("fixed");
  const [loanInterestValue, setLoanInterestValue] =
    useState("");

  const [loanRepaymentFrequency, setLoanRepaymentFrequency] =
    useState("weekly");

  const [loanStartDate, setLoanStartDate] =
    useState("");

  const [loanEndDate, setLoanEndDate] =
    useState("");

  const [loanNotes, setLoanNotes] =
    useState("");

  const [loanSaving, setLoanSaving] =
    useState(false);

  const [paymentModal, setPaymentModal] =
    useState(false);

  const [paymentAmount, setPaymentAmount] =
    useState("");

  const [paymentSaving, setPaymentSaving] =
    useState(false);

  // =====================================================
  // COUPONS
  // =====================================================

  const [coupons, setCoupons] = useState([]);

  const [couponModal, setCouponModal] =
    useState(false);

  const [couponCode, setCouponCode] =
    useState("");

  const [couponDiscountType, setCouponDiscountType] =
    useState("fixed");

  const [couponDiscountValue, setCouponDiscountValue] =
    useState("");

  const [couponExpiresAt, setCouponExpiresAt] =
    useState("");

  const [couponNotes, setCouponNotes] =
    useState("");

  // =====================================================
  // LOAD
  // =====================================================

  useEffect(() => {
    if (!id) return;

    loadCustomer();
  }, [id]);

  // =====================================================
  // LOAD CUSTOMER
  // =====================================================

  async function loadCustomer() {
    try {
      const response = await fetch(
        `${API}/customers/${id}`
      );

      if (!response.ok) {
        throw new Error("Customer not found");
      }

      const data = await response.json();

      setCustomer(data);
      setForm(data);

      try {
        const [ordersResponse, historyResponse] = await Promise.all([
          fetch(`${API}/customers/${id}/orders`),
          fetch(`${API}/customers/${id}/payment-history`)
        ]);
        const ordersData = await ordersResponse.json().catch(() => ({}));
        const historyData = await historyResponse.json().catch(() => ({}));
        setCustomerOrders(Array.isArray(ordersData?.orders) ? ordersData.orders : []);
        setCustomerPaymentHistory(Array.isArray(historyData?.payments) ? historyData.payments : []);
      } catch (historyError) {
        console.error("Failed to load customer order/payment history:", historyError);
        setCustomerOrders([]);
        setCustomerPaymentHistory([]);
      }

      await Promise.all([
        refreshWallet(),
        loadTransactions(),
        loadLoan(),
        loadCoupons(),
      ]);

    } catch (error) {
      console.error(
        "Failed to load customer:",
        error
      );
    }
  }

  // =====================================================
  // WALLET
  // =====================================================

  async function refreshWallet() {
    try {
      const response = await fetch(
        `${API}/wallet/${id}`
      );

      if (!response.ok) {
        setWallet({
          balance: 0,
        });

        return;
      }

      const data = await response.json();

      setWallet(
        data || {
          balance: 0,
        }
      );

    } catch (error) {
      console.error(
        "Failed to load wallet:",
        error
      );

      setWallet({
        balance: 0,
      });
    }
  }

  // =====================================================
  // WALLET TRANSACTIONS
  // =====================================================

  async function loadTransactions() {
    try {
      const response = await fetch(
        `${API}/wallet/${id}/transactions`
      );

      if (!response.ok) {
        setTransactions([]);
        return;
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setTransactions(data);

      } else if (
        Array.isArray(data.transactions)
      ) {
        setTransactions(
          data.transactions
        );

      } else {
        setTransactions([]);
      }

    } catch (error) {
      console.error(
        "Failed to load transactions:",
        error
      );

      setTransactions([]);
    }
  }

  async function refreshWalletData() {
    await Promise.all([
      refreshWallet(),
      loadTransactions(),
    ]);
  }

  async function deductWalletMoney() {
    const amount = Number(deductAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    if (amount > Number(wallet?.balance || 0)) {
      alert("The deduction cannot be greater than the customer's wallet balance.");
      return;
    }

    try {
      setDeductSaving(true);
      const response = await fetch(`${API}/wallet/${id}/deduct`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          amount,
          description: deductDescription.trim() || "Money deducted by admin",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to deduct money.");
      }
      setDeductAmount("");
      setDeductDescription("");
      setDeductOpen(false);
      await refreshWalletData();
      alert(`$${amount.toFixed(2)} deducted successfully.`);
    } catch (error) {
      console.error("DEDUCT WALLET ERROR:", error);
      alert(error.message || "Failed to deduct money.");
    } finally {
      setDeductSaving(false);
    }
  }

  // =====================================================
  // LOAN - LOAD
  // =====================================================

  async function loadLoan() {
    try {
      const response = await fetch(
        `${API}/loans/customer/${id}`
      );

      /*
        The backend returns an empty loan object
        when the customer doesn't have a loan.
      */

      if (!response.ok) {
        console.warn(
          "Loan request failed:",
          response.status
        );

        setLoan(null);
        return;
      }

      const data = await response.json();

      /*
        Treat a zero/empty loan as no loan.
      */

      const hasLoan =
        Number(data?.total_amount || 0) > 0 ||
        data?.status ||
        data?.loan_status;

      if (!hasLoan) {
        setLoan(null);
        return;
      }

      setLoan(data);

    } catch (error) {
      console.error(
        "Failed to load loan:",
        error
      );

      setLoan(null);
    }
  }

  // =====================================================
  // LOAN - RESET FORM
  // =====================================================

  function resetLoanForm() {
    setLoanAmount("");
    setLoanInterestType("fixed");
    setLoanInterestValue("");
    setLoanRepaymentFrequency("weekly");
    setLoanStartDate("");
    setLoanEndDate("");
    setLoanNotes("");
  }

  // =====================================================
  // LOAN - OPEN
  // =====================================================

  function openLoanModal() {
    resetLoanForm();

    const today =
      new Date()
        .toISOString()
        .split("T")[0];

    setLoanStartDate(today);

    setLoanModal(true);
  }

  // =====================================================
  // LOAN - CLOSE
  // =====================================================

  function closeLoanModal() {
    if (loanSaving) return;

    setLoanModal(false);
    resetLoanForm();
  }

  // =====================================================
  // LOAN - CREATE
  // =====================================================

 async function createLoan() {
  const amount = Number(loanAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Please enter a valid loan amount.");
    return;
  }

  if (!loanStartDate) {
    alert("Please select a loan start date.");
    return;
  }

  if (!loanEndDate) {
    alert("Please select a loan end date.");
    return;
  }

  if (loanEndDate <= loanStartDate) {
    alert("End date must be after the start date.");
    return;
  }

  const interest = Number(loanInterestValue || 0);

  if (!Number.isFinite(interest) || interest < 0) {
    alert("Please enter a valid interest value.");
    return;
  }

  try {
    setLoanSaving(true);

    const response = await fetch(
      `${API}/loans/customer/${id}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          total_amount: amount,

          start_date: loanStartDate,

          end_date: loanEndDate,

          interest_type:
            loanInterestType || "fixed",

          interest_value: interest,

          repayment_frequency:
            loanRepaymentFrequency || "weekly",

          notes:
            loanNotes?.trim() || "",
        }),
      }
    );

    const data =
      await response
        .json()
        .catch(() => ({}));

    console.log(
      "CREATE LOAN RESPONSE:",
      response.status,
      data
    );

    if (!response.ok) {
      alert(
        data?.details ||
          data?.error ||
          "Failed to create loan."
      );

      return;
    }

    setLoan(
      data.loan || data
    );

    setLoanAmount("");
    setLoanStartDate("");
    setLoanEndDate("");
    setLoanInterestValue("");
    setLoanNotes("");

    setLoanModal(false);

    await loadLoan();

  } catch (error) {
    console.error(
      "CREATE LOAN ERROR:",
      error
    );

    alert(
      error.message ||
        "Failed to create loan."
    );

  } finally {
    setLoanSaving(false);
  }
}
  // =====================================================
  // LOAN - DISABLE
  // =====================================================

  async function disableLoan() {
    const confirmed =
      window.confirm(
        "Disable this customer's active loan?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API}/loans/customer/${id}/disable`,
          {
            method: "PUT",
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        alert(
          data?.error ||
            "Failed to disable loan."
        );

        return;
      }

      await loadLoan();

    } catch (error) {
      console.error(
        "DISABLE LOAN ERROR:",
        error
      );

      alert(
        "Failed to disable loan."
      );
    }
  }

  // =====================================================
  // LOAN - PAYMENT MODAL
  // =====================================================

  function openPaymentModal() {
    setPaymentAmount("");
    setPaymentModal(true);
  }

  function closePaymentModal() {
    if (paymentSaving) return;

    setPaymentModal(false);
    setPaymentAmount("");
  }

  // =====================================================
  // LOAN - PAYMENT
  // =====================================================

  async function addLoanPayment() {
    const amount =
      Number(paymentAmount);

    const remaining =
      Number(
        loan?.remaining ??
          loan?.principal_remaining ??
          loan?.remaining_balance ??
          0
      );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert(
        "Please enter a valid payment amount."
      );

      return;
    }

    if (amount > remaining) {
      alert(
        "Payment cannot be greater than the remaining balance."
      );

      return;
    }

    try {
      setPaymentSaving(true);

      const response =
        await fetch(
          `${API}/loans/customer/${id}/payment`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              amount,
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        alert(
          data?.error ||
            "Failed to record payment."
        );

        return;
      }

      setLoan(
        data.loan ||
          data
      );

      closePaymentModal();

    } catch (error) {
      console.error(
        "ADD LOAN PAYMENT ERROR:",
        error
      );

      alert(
        "Failed to record payment."
      );

    } finally {
      setPaymentSaving(false);
    }
  }

  // =====================================================
  // COUPONS - LOAD
  // =====================================================

  async function loadCoupons() {
    try {
      const response =
        await fetch(
          `${API}/customers/${id}/coupons`
        );

      if (!response.ok) {
        setCoupons([]);
        return;
      }

      const data =
        await response.json();

      setCoupons(
        Array.isArray(data)
          ? data
          : []
      );

    } catch (error) {
      console.error(
        "Failed to load coupons:",
        error
      );

      setCoupons([]);
    }
  }

  // =====================================================
  // COUPONS - RESET
  // =====================================================

  function resetCouponForm() {
    setCouponCode("");
    setCouponDiscountType(
      "fixed"
    );
    setCouponDiscountValue("");
    setCouponExpiresAt("");
    setCouponNotes("");
  }

  // =====================================================
  // COUPONS - CLOSE
  // =====================================================

  function closeCouponModal() {
    setCouponModal(false);
    resetCouponForm();
  }

  // =====================================================
  // COUPONS - ADD
  // =====================================================

  async function addCoupon() {
    const code =
      couponCode.trim();

    const value =
      Number(
        couponDiscountValue
      );

    if (!code) {
      alert(
        "Please enter a coupon code."
      );

      return;
    }

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      alert(
        "Please enter a valid discount."
      );

      return;
    }

    if (
      couponDiscountType ===
        "percentage" &&
      value > 100
    ) {
      alert(
        "Percentage discount cannot exceed 100%."
      );

      return;
    }

    try {
      const response =
        await fetch(
          `${API}/customers/${id}/coupons`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              code,

              discount_type:
                couponDiscountType,

              discount_value:
                value,

              expires_at:
                couponExpiresAt ||
                null,

              notes:
                couponNotes.trim(),
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        alert(
          data?.error ||
            "Failed to add coupon."
        );

        return;
      }

      setCoupons(
        (current) => [
          data,
          ...current,
        ]
      );

      resetCouponForm();

    } catch (error) {
      console.error(
        "ADD COUPON ERROR:",
        error
      );

      alert(
        "Failed to add coupon."
      );
    }
  }

  // =====================================================
  // COUPONS - REMOVE
  // =====================================================

  async function removeCoupon(
    couponId
  ) {
    const confirmed =
      window.confirm(
        "Remove this coupon from the customer?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API}/customers/${id}/coupons/${couponId}`,
          {
            method: "DELETE",
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        alert(
          data?.error ||
            "Failed to remove coupon."
        );

        return;
      }

      setCoupons(
        (current) =>
          current.filter(
            (coupon) =>
              coupon.id !==
              couponId
          )
      );

    } catch (error) {
      console.error(
        "REMOVE COUPON ERROR:",
        error
      );

      alert(
        "Failed to remove coupon."
      );
    }
  }

  // =====================================================
  // EDIT CUSTOMER
  // =====================================================

  async function saveCustomer() {
    try {
      const response =
        await fetch(
          `${API}/customers/${id}`,
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              full_name:
                form.full_name ||
                "",

              phone:
                form.phone ||
                "",

              telegram:
                form.telegram ||
                "",

              facebook:
                form.facebook ||
                "",

              address:
                form.address ||
                "",

              notes:
                form.notes ||
                "",
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Failed to update customer"
        );
      }

      setEditing(false);

      await loadCustomer();

    } catch (error) {
      console.error(
        "SAVE CUSTOMER ERROR:",
        error
      );

      alert(
        error.message ||
          "Failed to save customer."
      );
    }
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (!customer) {
    return (
      <div className="page-content">
        <div className="dashboard-empty">
          <h2>
            Loading customer...
          </h2>
        </div>
      </div>
    );
  }

  // =====================================================
  // LOAN VALUES
  // =====================================================

  const loanTotal =
    Number(
      loan?.total_amount || 0
    );

  const loanPaid =
    Number(
      loan?.paid_amount || 0
    );

  const loanRemaining =
    Number(
      loan?.remaining ??
        loan?.principal_remaining ??
        loan?.remaining_balance ??
        0
    );

  const loanPercentage =
    loanTotal > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (loanPaid /
              loanTotal) *
              100
          )
        )
      : 0;

  const loanActive =
    Boolean(
      loan &&
        (
          loan.enabled === true ||
          loan.enabled === 1
        ) &&
        (
          loan.status ===
            "active" ||
          loan.loan_status ===
            "active"
        ) &&
        loanRemaining > 0
    );

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="page-content">

      {/* =================================================
          BACK
      ================================================= */}

      <button
        className="back-button"
        onClick={() =>
          navigate("/customers")
        }
      >
        <ArrowLeft size={18} />
        Customers
      </button>

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="profile-hero">

        <div className="avatar">
          {customer.full_name
            ?.charAt(0)
            .toUpperCase()}
        </div>

        <div className="profile-name">

          <p className="eyebrow">
            CUSTOMER PROFILE
          </p>

          <h1>
            {customer.full_name}
          </h1>

          <p>
            Customer ID:{" "}
            {customer.customer_code}
          </p>

          <div className="contact-row">

            <span>
              <Phone size={15} />

              {customer.phone ||
                "No phone"}
            </span>

            <span>
              <MapPin size={15} />

              {customer.address ||
                "No address"}
            </span>

          </div>

        </div>

        <button
          className="edit-button"
          onClick={() =>
            setEditing(
              (value) => !value
            )
          }
        >
          {editing ? (
            <X size={18} />
          ) : (
            <Edit3 size={18} />
          )}

          {editing
            ? "Cancel"
            : "Edit Profile"}
        </button>

      </div>

      {/* =================================================
          EDIT CUSTOMER
      ================================================= */}

      {editing && (
        <div className="edit-panel">

          <h2>
            Edit Customer
          </h2>

          <input
            value={
              form.full_name || ""
            }
            placeholder="Full name"
            onChange={(e) =>
              setForm({
                ...form,
                full_name:
                  e.target.value,
              })
            }
          />

          <input
            value={
              form.phone || ""
            }
            placeholder="Phone"
            onChange={(e) =>
              setForm({
                ...form,
                phone:
                  e.target.value,
              })
            }
          />

          <input
            value={
              form.telegram || ""
            }
            placeholder="Telegram"
            onChange={(e) =>
              setForm({
                ...form,
                telegram:
                  e.target.value,
              })
            }
          />

          <input
            value={
              form.facebook || ""
            }
            placeholder="Facebook"
            onChange={(e) =>
              setForm({
                ...form,
                facebook:
                  e.target.value,
              })
            }
          />

          <input
            value={
              form.address || ""
            }
            placeholder="Address"
            onChange={(e) =>
              setForm({
                ...form,
                address:
                  e.target.value,
              })
            }
          />

          <textarea
            value={
              form.notes || ""
            }
            placeholder="Notes"
            onChange={(e) =>
              setForm({
                ...form,
                notes:
                  e.target.value,
              })
            }
          />

          <button
            className="save-button"
            onClick={saveCustomer}
          >
            <Save size={18} />
            Save Changes
          </button>

        </div>
      )}

      {/* =================================================
          STATS
      ================================================= */}

      <div className="customer-stats">

        {/* WALLET */}

        <div className="glass-card wallet">

          <div className="wallet-card-header">

            <div className="stat-icon">
              <Wallet size={22} />
            </div>

            <span>
              CUSTOMER WALLET
            </span>

          </div>

          <p>
            Available Balance
          </p>

          <h1>
            $
            {Number(
              wallet?.balance || 0
            ).toFixed(2)}
          </h1>

          <div className="customer-wallet-actions">
            <button
              type="button"
              className="customer-wallet-action customer-wallet-action-add"
              onClick={() => setMoneyOpen(true)}
            >
              <span className="customer-wallet-action-icon">
                <Plus size={17} strokeWidth={2.5} />
              </span>
              <span>Add Money</span>
            </button>
            <button
              type="button"
              className="customer-wallet-action customer-wallet-action-deduct"
              onClick={() => setDeductOpen(true)}
            >
              <span className="customer-wallet-action-icon">
                <ArrowDownRight size={17} strokeWidth={2.5} />
              </span>
              <span>Deduct Money</span>
            </button>
          </div>

        </div>

        {/* ORDERS */}

        <div
          className="glass-card"
          onClick={() =>
            navigate(
              `/orders?customer=${id}`
            )
          }
          style={{
            cursor: "pointer",
          }}
        >

          <ShoppingBag
            size={26}
          />

          <p>
            Orders
          </p>

          <h1>{customerOrders.length}</h1>

        </div>

        {/* RECEIPTS */}

        <div
          className="glass-card"
          onClick={() =>
            navigate(
              `/receipts?customer=${id}`
            )
          }
          style={{
            cursor: "pointer",
          }}
        >

          <Receipt
            size={26}
          />

          <p>
            Receipts
          </p>

          <h1>{customerPaymentHistory.filter((payment) => payment.payment_image || payment.receipt || payment.payment_receipt).length}</h1>

        </div>

        {/* COUPONS */}

        <div
          className="glass-card"
          onClick={() =>
            setCouponModal(true)
          }
          style={{
            cursor: "pointer",
          }}
        >

          <Ticket size={26} />

          <p>
            Coupons
          </p>

          <h1>
            {coupons.length}
          </h1>

          <span>
            Active coupons
          </span>

        </div>

      </div>

      {/* =================================================
          LOAN
      ================================================= */}

      <div className="customer-loan-section">

        <div className="loan-section-header">

          <div>

            <p className="eyebrow">
              FINANCE
            </p>

            <h2>
              Customer Loan
            </h2>

            <p>
              Manage this customer's
              loan directly from their
              profile.
            </p>

          </div>

          {!loan && (
            <button
              className="primary-button"
              onClick={openLoanModal}
            >
              <Plus size={17} />
              Add Loan
            </button>
          )}

        </div>

        {!loan ? (

          <div className="loan-profile-empty">

            <div className="loan-empty-icon">
              <CreditCard size={25} />
            </div>

            <div>

              <h3>
                No loan yet
              </h3>

              <p>
                Create a loan for this
                customer to start
                tracking repayments.
              </p>

            </div>

            <button
              className="primary-button"
              onClick={openLoanModal}
            >
              <Plus size={17} />
              Add Loan
            </button>

          </div>

        ) : (

          <div className="customer-loan-card">

            <div className="customer-loan-top">

              <div className="loan-customer-title">

                <div className="loan-profile-icon">
                  <DollarSign size={22} />
                </div>

                <div>

                  <h3>
                    Loan Details
                  </h3>

                  <span>
                    {loanActive
                      ? "Active loan"
                      : loan.status ===
                          "paid_off"
                        ? "Paid off"
                        : "Disabled"}
                  </span>

                </div>

              </div>

              <span
                className={
                  loanActive
                    ? "loan-status active"
                    : "loan-status disabled"
                }
              >
                {loanActive
                  ? "ACTIVE"
                  : loan.status ===
                      "paid_off"
                    ? "PAID"
                    : "DISABLED"}
              </span>

            </div>

            <div className="loan-profile-values">

              <div>
                <span>
                  Original Loan
                </span>

                <strong>
                  $
                  {loanTotal.toFixed(
                    2
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Paid
                </span>

                <strong>
                  $
                  {loanPaid.toFixed(
                    2
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Remaining
                </span>

                <strong>
                  $
                  {loanRemaining.toFixed(
                    2
                  )}
                </strong>
              </div>

            </div>

            <div className="loan-profile-progress">

              <div className="loan-profile-progress-label">

                <span>
                  Payment Progress
                </span>

                <strong>
                  {loanPercentage.toFixed(
                    0
                  )}
                  %
                </strong>

              </div>

              <div className="loan-profile-progress-track">

                <div
                  className="loan-profile-progress-bar"
                  style={{
                    width:
                      `${loanPercentage}%`,
                  }}
                />

              </div>

            </div>

            <div className="loan-profile-meta">

              <div>
                <CalendarDays size={15} />

                <span>
                  Start:{" "}
                  {loan.start_date ||
                    "—"}
                </span>
              </div>

              <div>
                <CalendarDays size={15} />

                <span>
                  End:{" "}
                  {loan.end_date ||
                    "—"}
                </span>
              </div>

              <div>
                <DollarSign size={15} />

                <span>
                  Interest:{" "}
                  {loan.interest_type ===
                    "percentage"
                    ? `${Number(
                        loan.interest_value ||
                          0
                      ).toFixed(2)}%`
                    : `$${Number(
                        loan.interest_value ||
                          0
                      ).toFixed(2)}`}
                </span>
              </div>

            </div>

            <div className="loan-profile-actions">

              {loanActive && (
                <button
                  className="primary-button"
                  onClick={
                    openPaymentModal
                  }
                  disabled={
                    loanRemaining <= 0
                  }
                >
                  <DollarSign
                    size={17}
                  />

                  {loanRemaining <=
                  0
                    ? "Fully Paid"
                    : "Add Payment"}
                </button>
              )}

              {loanActive && (
                <button
                  className="danger-button"
                  onClick={
                    disableLoan
                  }
                >
                  <Ban size={17} />
                  Disable Loan
                </button>
              )}

              {!loanActive &&
                loan.status !==
                  "paid_off" && (
                  <button
                    className="primary-button"
                    onClick={
                      openLoanModal
                    }
                  >
                    <Plus size={17} />
                    Create New Loan
                  </button>
                )}

            </div>

          </div>

        )}

      </div>

      {/* =================================================
          WALLET TRANSACTION HISTORY
      ================================================= */}

      <div className="wallet-history">

        <div className="history-header">

          <div>

            <p className="eyebrow">
              WALLET
            </p>

            <h2>
              Transaction History
            </h2>

          </div>

          <History size={21} />

        </div>

        {transactions.length ===
        0 ? (

          <div className="history-empty">

            <Wallet size={25} />

            <p>
              No wallet transactions
              yet.
            </p>

          </div>

        ) : (

          <div className="transaction-list">

            {transactions.map(
              (
                transaction,
                index
              ) => {

                const transactionAmount =
                  Number(
                    transaction?.amount ||
                      0
                  );

                const positive =
                  transactionAmount >=
                  0;

                return (
                  <div
                    className="transaction-row"
                    key={
                      transaction?.id ??
                      `${transaction?.created_at}-${index}`
                    }
                  >

                    <div
                      className={
                        positive
                          ? "transaction-icon positive"
                          : "transaction-icon negative"
                      }
                    >

                      {positive ? (
                        <ArrowUpRight
                          size={18}
                        />
                      ) : (
                        <ArrowDownRight
                          size={18}
                        />
                      )}

                    </div>

                    <div className="transaction-info">

                      <strong>
                        {transaction?.description ||
                          transaction?.type ||
                          "Wallet transaction"}
                      </strong>

                      <span>
                        {transaction?.created_at ||
                          ""}
                      </span>

                    </div>

                    <div
                      className={
                        positive
                          ? "transaction-amount positive-text"
                          : "transaction-amount negative-text"
                      }
                    >

                      {positive
                        ? "+"
                        : ""}

                      $

                      {Math.abs(
                        transactionAmount
                      ).toFixed(2)}

                    </div>

                  </div>
                );

              }
            )}

          </div>

        )}

      </div>

      {/* =================================================
          CUSTOMER INFORMATION
      ================================================= */}

      <div className="info-card">

        <h2>
          Customer Information
        </h2>

        <div className="info-grid">

          <p>
            <strong>
              Name
            </strong>

            <br />

            {customer.full_name}
          </p>

          <p>
            <strong>
              Phone
            </strong>

            <br />

            {customer.phone ||
              "-"}
          </p>

          <p>
            <strong>
              Telegram
            </strong>

            <br />

            {customer.telegram ||
              "-"}
          </p>

          <p>
            <strong>
              Facebook
            </strong>

            <br />

            {customer.facebook ||
              "-"}
          </p>

          <p>
            <strong>
              Address
            </strong>

            <br />

            {customer.address ||
              "-"}
          </p>

          <p>
            <strong>
              Notes
            </strong>

            <br />

            {customer.notes ||
              "-"}
          </p>

        </div>

      </div>

      {/* =================================================
          DEDUCT MONEY MODAL
      ================================================= */}
      {deductOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget && !deductSaving) setDeductOpen(false); }}
        >
          <div className="modal-card" style={{ maxWidth: 460, width: "92%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <p className="eyebrow">WALLET</p>
                <h2 style={{ margin: 0 }}>Deduct Money</h2>
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                  Current balance: ${Number(wallet?.balance || 0).toFixed(2)}
                </p>
              </div>
              <button type="button" onClick={() => setDeductOpen(false)} disabled={deductSaving} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "grid", gap: 14, marginTop: 22 }}>
              <label>
                <span>Amount</span>
                <input type="number" min="0.01" step="0.01" value={deductAmount} onChange={(e) => setDeductAmount(e.target.value)} placeholder="0.00" />
              </label>
              <label>
                <span>Reason</span>
                <input value={deductDescription} onChange={(e) => setDeductDescription(e.target.value)} placeholder="e.g. Order payment" />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setDeductOpen(false)} disabled={deductSaving}>Cancel</button>
                <button type="button" className="primary-button" onClick={deductWalletMoney} disabled={deductSaving}>
                  {deductSaving ? "Deducting..." : "Deduct Money"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          ADD MONEY MODAL
      ================================================= */}

      <AddMoneyModal
        open={moneyOpen}
        close={() =>
          setMoneyOpen(false)
        }
        customerId={id}
        customerName={
          customer.full_name
        }
        onSuccess={
          refreshWalletData
        }
      />

      {/* =================================================
          ADD LOAN MODAL
      ================================================= */}

      {loanModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeLoanModal();
            }
          }}
        >

          <div className="money-modal loan-modal">

            <button
              className="close-btn"
              type="button"
              onClick={
                closeLoanModal
              }
            >
              <X size={20} />
            </button>

            <div className="modal-icon">
              <CreditCard size={25} />
            </div>

            <p className="eyebrow">
              CUSTOMER LOAN
            </p>

            <h2>
              Add Loan
            </h2>

            <p>
              Create a loan for{" "}
              <strong>
                {customer.full_name}
              </strong>
            </p>

            <label>
              Loan Amount
            </label>

            <div className="amount-input">

              <span>
                $
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={
                  loanAmount
                }
                onChange={(e) =>
                  setLoanAmount(
                    e.target.value
                  )
                }
              />

            </div>

            <label>
              Interest Type
            </label>

            <select
              value={
                loanInterestType
              }
              onChange={(e) =>
                setLoanInterestType(
                  e.target.value
                )
              }
            >

              <option value="fixed">
                Fixed Amount
              </option>

              <option value="percentage">
                Percentage
              </option>

            </select>

            <label>
              Interest Value
            </label>

            <div className="amount-input">

              <span>
                {loanInterestType ===
                "percentage"
                  ? "%"
                  : "$"}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={
                  loanInterestValue
                }
                onChange={(e) =>
                  setLoanInterestValue(
                    e.target.value
                  )
                }
              />

            </div>

            <label>
              Repayment Frequency
            </label>

            <select
              value={loanRepaymentFrequency}
              onChange={(e) =>
                setLoanRepaymentFrequency(
                  e.target.value
                )
              }
            >
              <option value="weekly">
                Weekly payments
              </option>

              <option value="one_time">
                One-time payment
              </option>
            </select>

            <div className="loan-date-grid">

              <div>

                <label>
                  Start Date
                </label>

                <input
                  type="date"
                  value={
                    loanStartDate
                  }
                  onChange={(e) =>
                    setLoanStartDate(
                      e.target.value
                    )
                  }
                />

              </div>

              <div>

                <label>
                  End Date
                </label>

                <input
                  type="date"
                  value={
                    loanEndDate
                  }
                  onChange={(e) =>
                    setLoanEndDate(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>

            <label>
              Notes
            </label>

            <textarea
              placeholder="Optional loan notes..."
              value={
                loanNotes
              }
              onChange={(e) =>
                setLoanNotes(
                  e.target.value
                )
              }
            />

            <div className="loan-modal-actions">

              <button
                className="secondary-button"
                type="button"
                onClick={
                  closeLoanModal
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                type="button"
                disabled={
                  loanSaving ||
                  !loanAmount ||
                  Number(
                    loanAmount
                  ) <= 0 ||
                  !loanStartDate ||
                  !loanEndDate
                }
                onClick={
                  createLoan
                }
              >

                <Plus size={17} />

                {loanSaving
                  ? "Creating..."
                  : "Create Loan"}

              </button>

            </div>

          </div>

        </div>
      )}

      {/* =================================================
          LOAN PAYMENT MODAL
      ================================================= */}

      {paymentModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closePaymentModal();
            }
          }}
        >

          <div className="money-modal">

            <button
              className="close-btn"
              type="button"
              onClick={
                closePaymentModal
              }
            >
              <X size={20} />
            </button>

            <div className="modal-icon">
              <DollarSign size={25} />
            </div>

            <p className="eyebrow">
              LOAN PAYMENT
            </p>

            <h2>
              Add Payment
            </h2>

            <p>
              {customer.full_name}
            </p>

            <div className="loan-payment-balance">

              <span>
                Remaining Balance
              </span>

              <strong>
                $
                {loanRemaining.toFixed(
                  2
                )}
              </strong>

            </div>

            <label>
              Payment Amount
            </label>

            <div className="amount-input">

              <span>
                $
              </span>

              <input
                type="number"
                min="0.01"
                max={
                  loanRemaining
                }
                step="0.01"
                placeholder="0.00"
                value={
                  paymentAmount
                }
                onChange={(e) =>
                  setPaymentAmount(
                    e.target.value
                  )
                }
                autoFocus
              />

            </div>

            <div className="loan-modal-actions">

              <button
                className="secondary-button"
                type="button"
                onClick={
                  closePaymentModal
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                type="button"
                disabled={
                  paymentSaving ||
                  !paymentAmount ||
                  Number(
                    paymentAmount
                  ) <= 0 ||
                  Number(
                    paymentAmount
                  ) >
                    loanRemaining
                }
                onClick={
                  addLoanPayment
                }
              >

                <DollarSign
                  size={17}
                />

                {paymentSaving
                  ? "Recording..."
                  : "Record Payment"}

              </button>

            </div>

          </div>

        </div>
      )}

      {/* =================================================
          COUPON MODAL
      ================================================= */}

      {couponModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeCouponModal();
            }
          }}
        >

          <div className="money-modal">

            <button
              className="close-btn"
              onClick={
                closeCouponModal
              }
              type="button"
            >
              <X size={20} />
            </button>

            <div className="modal-icon">
              <Ticket size={25} />
            </div>

            <p className="eyebrow">
              CUSTOMER COUPONS
            </p>

            <h2>
              {customer.full_name}'s
              Coupons
            </h2>

            {/* CURRENT COUPONS */}

            <div className="coupon-list">

              {coupons.length ===
              0 ? (

                <div className="coupon-empty">

                  <Ticket size={24} />

                  <p>
                    No coupons yet
                  </p>

                </div>

              ) : (

                coupons.map(
                  (coupon) => (

                    <div
                      className="coupon-item"
                      key={
                        coupon.id
                      }
                    >

                      <div>

                        <strong>
                          {coupon.code}
                        </strong>

                        <div>
                          {coupon.discount_type ===
                          "percentage"
                            ? `${coupon.discount_value}% OFF`
                            : `$${Number(
                                coupon.discount_value
                              ).toFixed(
                                2
                              )} OFF`}
                        </div>

                        {coupon.expires_at && (
                          <small>
                            Expires:{" "}
                            {
                              coupon.expires_at
                            }
                          </small>
                        )}

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeCoupon(
                            coupon.id
                          )
                        }
                        className="coupon-delete"
                      >
                        <Trash2
                          size={16}
                        />
                      </button>

                    </div>

                  )
                )

              )}

            </div>

            {/* ADD COUPON */}

            <div className="coupon-add-section">

              <p className="eyebrow">
                ADD COUPON
              </p>

              <label>
                Coupon Code
              </label>

              <input
                type="text"
                placeholder="WELCOME10"
                value={
                  couponCode
                }
                onChange={(e) =>
                  setCouponCode(
                    e.target.value.toUpperCase()
                  )
                }
              />

              <label>
                Discount Type
              </label>

              <select
                value={
                  couponDiscountType
                }
                onChange={(e) =>
                  setCouponDiscountType(
                    e.target.value
                  )
                }
              >

                <option value="fixed">
                  Fixed Amount
                </option>

                <option value="percentage">
                  Percentage
                </option>

              </select>

              <label>
                Discount Value
              </label>

              <div className="amount-input">

                <span>
                  {couponDiscountType ===
                  "percentage"
                    ? "%"
                    : "$"}
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={
                    couponDiscountValue
                  }
                  onChange={(e) =>
                    setCouponDiscountValue(
                      e.target.value
                    )
                  }
                />

              </div>

              <label>
                Expiration Date
              </label>

              <input
                type="date"
                value={
                  couponExpiresAt
                }
                onChange={(e) =>
                  setCouponExpiresAt(
                    e.target.value
                  )
                }
              />

              <label>
                Notes
              </label>

              <textarea
                placeholder="Optional notes..."
                value={
                  couponNotes
                }
                onChange={(e) =>
                  setCouponNotes(
                    e.target.value
                  )
                }
              />

              <button
                className="primary-button"
                onClick={
                  addCoupon
                }
                type="button"
              >

                <Plus size={17} />

                Add Coupon

              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default CustomerProfile;