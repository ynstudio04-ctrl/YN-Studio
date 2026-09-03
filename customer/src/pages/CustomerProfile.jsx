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
} from "lucide-react";

import { useParams, useNavigate } from "react-router-dom";

import AddMoneyModal from "../components/AddMoneyModal";

// =====================================================
// API
// =====================================================

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// =====================================================
// CUSTOMER PROFILE
// =====================================================

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  // =====================================================
  // CUSTOMER
  // =====================================================

  const [customer, setCustomer] = useState(null);

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
  // LOAD CUSTOMER
  // =====================================================

  useEffect(() => {
    if (!id) return;

    loadCustomer();
  }, [id]);
// =====================================================
// COUPONS - LOAD
// =====================================================

async function loadCoupons() {
  try {
    const response = await fetch(
      `${API}/customers/${id}/coupons`
    );

    if (!response.ok) {
      setCoupons([]);
      return;
    }

    const data = await response.json();

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
// COUPONS - RESET FORM
// =====================================================

function resetCouponForm() {
  setCouponCode("");
  setCouponDiscountType("fixed");
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
    Number(couponDiscountValue);

  if (!code) {
    alert("Please enter a coupon code.");
    return;
  }

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    alert("Please enter a valid discount.");
    return;
  }

  if (
    couponDiscountType === "percentage" &&
    value > 100
  ) {
    alert(
      "Percentage discount cannot exceed 100%."
    );

    return;
  }

  try {
    const response = await fetch(
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
            couponExpiresAt || null,

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

    setCoupons((current) => [
      data,
      ...current,
    ]);

    closeCouponModal();

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

    setCoupons((current) =>
      current.filter(
        (coupon) =>
          coupon.id !== couponId
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

  // =====================================================
  // REFRESH WALLET DATA
  // =====================================================

  async function refreshWalletData() {
    await Promise.all([
      refreshWallet(),
      loadTransactions(),
    ]);
  }

  // =====================================================
  // EDIT CUSTOMER
  // =====================================================

  async function saveCustomer() {
    try {
      const response = await fetch(
        `${API}/customers/${id}`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            full_name:
              form.full_name || "",

            phone:
              form.phone || "",

            telegram:
              form.telegram || "",

            facebook:
              form.facebook || "",

            address:
              form.address || "",

            notes:
              form.notes || "",
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

        {/* =================================================
            WALLET
        ================================================= */}

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

          <button
            onClick={() =>
              setMoneyOpen(true)
            }
          >
            <Plus size={16} />

            Add Money
          </button>

        </div>

        {/* =================================================
            ORDERS
        ================================================= */}

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

          <h1>
            0
          </h1>

        </div>

        {/* =================================================
            RECEIPTS
        ================================================= */}

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

          <h1>
            0
          </h1>

        </div>

      </div>

      {
      /* =================================================
          WALLET TRANSACTION HISTORY
      ================================================= */}
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

          <History
            size={21}
          />

        </div>

        {transactions.length ===
        0 ? (

          <div className="history-empty">

            <Wallet
              size={25}
            />

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
    COUPON MODAL
================================================= */}

{couponModal && (
  <div
    className="modal-overlay"
    onClick={(e) => {
      if (
        e.target === e.currentTarget
      ) {
        closeCouponModal();
      }
    }}
  >
    <div className="money-modal">

      <button
        className="close-btn"
        onClick={closeCouponModal}
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
        {customer.full_name}'s Coupons
      </h2>

      {/* CURRENT COUPONS */}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "18px",
          marginBottom: "20px",
          maxHeight: "220px",
          overflowY: "auto",
        }}
      >
        {coupons.length === 0 ? (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              opacity: 0.6,
              borderRadius: "12px",
              border:
                "1px dashed rgba(255,255,255,0.15)",
            }}
          >
            <Ticket
              size={24}
              style={{
                marginBottom: "8px",
              }}
            />

            <p>
              No coupons yet
            </p>
          </div>
        ) : (
          coupons.map((coupon) => (
            <div
              key={coupon.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "12px",
                padding: "12px",
                borderRadius: "12px",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div>
                <strong>
                  {coupon.code}
                </strong>

                <div
                  style={{
                    fontSize: "13px",
                    opacity: 0.7,
                    marginTop: "3px",
                  }}
                >
                  {coupon.discount_type ===
                  "percentage"
                    ? `${coupon.discount_value}% OFF`
                    : `$${Number(
                        coupon.discount_value
                      ).toFixed(2)} OFF`}
                </div>

                {coupon.expires_at && (
                  <div
                    style={{
                      fontSize: "11px",
                      opacity: 0.5,
                      marginTop: "3px",
                    }}
                  >
                    Expires:{" "}
                    {coupon.expires_at}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  removeCoupon(
                    coupon.id
                  )
                }
                style={{
                  border: "none",
                  background:
                    "rgba(255,60,60,0.12)",
                  color: "#ff6b6b",
                  borderRadius: "8px",
                  padding: "8px",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ADD COUPON */}

      <div
        style={{
          borderTop:
            "1px solid rgba(255,255,255,0.08)",
          paddingTop: "18px",
        }}
      >
        <p className="eyebrow">
          ADD COUPON
        </p>

        <label>
          Coupon Code
        </label>

        <input
          type="text"
          placeholder="WELCOME10"
          value={couponCode}
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
          value={couponNotes}
          onChange={(e) =>
            setCouponNotes(
              e.target.value
            )
          }
        />

        <button
          className="primary-button"
          onClick={addCoupon}
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