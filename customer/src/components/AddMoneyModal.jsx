import { useState } from "react";
import { X, Wallet } from "lucide-react";

function AddMoneyModal({
  open,
  close,
  customerId,
  customerName,
  onSuccess
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) {
    return null;
  }

  async function addMoney() {
    const value = Number(amount);

    if (!value || value <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/wallet/${customerId}/add`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            amount: value
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to add money"
        );
      }

      setAmount("");

      if (onSuccess) {
        onSuccess();
      }

      close();

    } catch (error) {
      console.error(error);

      alert(
        error.message ||
        "Failed to add money."
      );

    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">

      <div className="money-modal">

        <button
          className="close-btn"
          onClick={close}
        >
          <X size={20} />
        </button>


        <div className="modal-icon">
          <Wallet size={25} />
        </div>


        <p className="eyebrow">
          CUSTOMER WALLET
        </p>


        <h2>
          Add Money
        </h2>


        <p className="modal-description">
          Add money directly to{" "}
          <strong>
            {customerName || "this customer"}
          </strong>
          's wallet.
        </p>


        <label>
          Amount
        </label>


        <div className="amount-input">

          <span>
            $
          </span>

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


        <button
          className="primary-button wallet-add-button"
          onClick={addMoney}
          disabled={loading}
        >

          <Wallet size={18} />

          {loading
            ? "Adding..."
            : "Add Money"}

        </button>


        <button
          className="modal-cancel"
          onClick={close}
          disabled={loading}
        >
          Cancel
        </button>


      </div>

    </div>
  );
}

export default AddMoneyModal;