
function Wallet() {
  return (
    <div className="wallet-page">
      <div className="wallet-header">
        <div>
          <h1>Wallet</h1>
          <p>Manage customer balances and wallet transactions.</p>
        </div>

        <button className="wallet-add-btn">
          + Add Money
        </button>
      </div>

      <div className="wallet-summary">
        <div className="wallet-card wallet-balance-card">
          <div className="wallet-card-top">
            <span>Available Balance</span>
            <div className="wallet-icon">$</div>
          </div>

          <h2>$0.00</h2>

          <p>
            Current customer wallet balance
          </p>
        </div>

        <div className="wallet-card">
          <div className="wallet-card-top">
            <span>Total Added</span>
            <div className="wallet-icon">＋</div>
          </div>

          <h2>$0.00</h2>

          <p>
            Money added to wallets
          </p>
        </div>

        <div className="wallet-card">
          <div className="wallet-card-top">
            <span>Total Deducted</span>
            <div className="wallet-icon">−</div>
          </div>

          <h2>$0.00</h2>

          <p>
            Money deducted from wallets
          </p>
        </div>
      </div>

      <div className="wallet-section">
        <div className="wallet-section-header">
          <div>
            <h2>Customer Wallets</h2>
            <p>
              Select a customer to manage their balance.
            </p>
          </div>

          <div className="wallet-search">
            <input
              type="text"
              placeholder="Search customer..."
            />
          </div>
        </div>

        <div className="wallet-empty">
          <div className="wallet-empty-icon">$</div>

          <h3>No customer wallets yet</h3>

          <p>
            Customer wallet balances will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Wallet;

