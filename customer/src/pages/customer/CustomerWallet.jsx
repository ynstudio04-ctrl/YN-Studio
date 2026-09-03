import React, { useEffect, useState } from "react";

import {
  ArrowLeft,
  Wallet,
  Plus,
  CheckCircle2,
  Clock3,
  XCircle,
  ChevronRight,
  CreditCard,
  Smartphone,
  X,
  ArrowUpRight,
  AlertCircle,
  LockKeyhole,
  Target,
  ReceiptText,
} from "lucide-react";

import "./CustomerWallet.css";
import QRCode from "../../assets/QR.PNG";
import { customerRequest } from "../../lib/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CustomerWallet() {

  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showWithdrawNotice, setShowWithdrawNotice] =
    useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawQr, setWithdrawQr] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const walletSessionValid = () => {
    const stamp = Number(localStorage.getItem("customerWalletUnlockedAt") || 0);
    return stamp > 0 && Date.now() - stamp < 60 * 60 * 1000;
  };

  const [walletUnlocked, setWalletUnlocked] = useState(walletSessionValid);
  const [showPasscode, setShowPasscode] = useState(!walletSessionValid());
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [checkingPasscode, setCheckingPasscode] = useState(false);

  /*
  =========================================================
  GET CUSTOMER ID
  =========================================================
  */

  const getCustomerId = () => {
    const possibleKeys = [
      "customer",
      "user",
      "customerUser",
      "customerData",
      "currentCustomer",
    ];

    for (const key of possibleKeys) {
      const stored = localStorage.getItem(key);

      if (!stored) continue;

      try {
        const parsed = JSON.parse(stored);

        const id =
          parsed?.customer_id ??
          parsed?.customerId ??
          parsed?.customer?.id ??
          parsed?.customer?.customer_id ??
          parsed?.user?.id ??
          parsed?.user?.customer_id ??
          parsed?.id;

        if (
          id !== undefined &&
          id !== null &&
          id !== ""
        ) {
          return Number(id);
        }
      } catch (error) {
        console.log(
          `Could not parse localStorage key "${key}"`
        );
      }
    }

    const directKeys = [
      "customer_id",
      "customerId",
      "customerID",
      "user_id",
      "userId",
    ];

    for (const key of directKeys) {
      const value = localStorage.getItem(key);

      if (value) {
        const numericId = Number(value);

        if (
          Number.isInteger(numericId) &&
          numericId > 0
        ) {
          return numericId;
        }
      }
    }

    return null;
  };

  /*
  =========================================================
  LOAD WALLET
  =========================================================
  */

  const loadWallet = async () => {
    try {
      setLoadingWallet(true);

      const customerId = getCustomerId();

      console.log(
        "WALLET CUSTOMER ID:",
        customerId
      );

      if (!customerId) {
        console.error("No customer ID found.");

        setBalance(0);
        setTransactions([]);

        return;
      }

      const walletResponse = await fetch(
        `${API_URL}/wallet/${customerId}`
      );

      const walletData =
        await walletResponse.json();

      if (!walletResponse.ok) {
        throw new Error(
          walletData.error ||
            "Failed to load wallet"
        );
      }

      setBalance(
        Number(walletData.balance) || 0
      );

      const transactionResponse =
        await fetch(
          `${API_URL}/wallet/${customerId}/transactions`
        );

      const transactionData =
        await transactionResponse.json();

      let walletTransactions = [];

      if (
        transactionResponse.ok &&
        Array.isArray(transactionData)
      ) {
        walletTransactions = transactionData;
      }

      const paymentsData = await customerRequest("/api/customer/wallet/payments");

      const customerPayments = Array.isArray(paymentsData?.payments)
        ? paymentsData.payments
        : [];

      const paymentActivities =
        customerPayments.map((payment) => ({
          id: `payment-${payment.id}`,

          amount:
            Number(payment.amount) || 0,

          status:
            payment.status === "approved"
              ? "approved"
              : payment.status === "rejected"
              ? "rejected"
              : "pending",

          type: "wallet_deposit",

          description:
            payment.status === "approved"
              ? `Deposit $${Number(
                  payment.amount
                ).toFixed(2)}`
              : payment.status === "rejected"
              ? `Deposit $${Number(
                  payment.amount
                ).toFixed(2)} rejected`
              : `Deposit $${Number(
                  payment.amount
                ).toFixed(2)} pending approval`,

          created_at:
            payment.created_at ||
            payment.payment_date ||
            payment.date,

          payment_id: payment.id,
        }));

      const filteredTransactions =
        walletTransactions.filter(
          (transaction) =>
            transaction.type !== "customer_topup"
        );

      const combinedActivity = [
        ...paymentActivities,
        ...filteredTransactions,
      ].sort((a, b) => {
        const dateA = new Date(
          a.created_at ||
            a.payment_date ||
            a.date ||
            0
        ).getTime();

        const dateB = new Date(
          b.created_at ||
            b.payment_date ||
            b.date ||
            0
        ).getTime();

        return dateB - dateA;
      });

      setTransactions(combinedActivity);
    } catch (error) {
      console.error(
        "LOAD WALLET ERROR:",
        error
      );

      setBalance(0);
      setTransactions([]);
    } finally {
      setLoadingWallet(false);
    }
  };

  useEffect(() => {
    if (walletUnlocked) {
      loadWallet();
    }
  }, [walletUnlocked]);

  /*
  =========================================================
  WALLET PASSCODE
  =========================================================
  */

  const verifyWalletPasscode = async (event) => {
    event.preventDefault();

    if (!/^\d{4}$/.test(passcode)) {
      setPasscodeError("Enter your 4-digit passcode.");
      return;
    }

    try {
      setCheckingPasscode(true);
      setPasscodeError("");

      const token = localStorage.getItem("customerToken");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch(
        `${API_URL}/api/customer/wallet/verify-passcode`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ passcode }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.message || "Incorrect passcode."
        );
      }

      localStorage.setItem("customerWalletUnlockedAt", String(Date.now()));
      setWalletUnlocked(true);
      setShowPasscode(false);
      setPasscode("");
    } catch (error) {
      setPasscodeError(
        error.message || "Incorrect passcode."
      );
    } finally {
      setCheckingPasscode(false);
    }
  };

  /*
  =========================================================
  NAVIGATION
  =========================================================
  */

  const handleNavigation = (path) => {
    window.location.href = path;
  };

  /*
  =========================================================
  ADD MONEY FILE
  =========================================================
  */

  /*
  =========================================================
  SUBMIT DEPOSIT
  =========================================================
  */

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;

    if (!amount || Number(amount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    if (!paymentMethod) setPaymentMethod("qr");

    try {
      setSubmitting(true);

      const customerId = getCustomerId();

      if (!customerId) {
        alert(
          "Customer account could not be identified. Please log in again."
        );
        return;
      }

      const token = localStorage.getItem("customerToken");
      const response = await fetch(
        `${API_URL}/wallet/request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            amount: Number(amount),
            payment_method: paymentMethod || "qr",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Payment request failed"
        );
      }

      alert(
        "Payment request created. Pay the exact amount shown and YN Studio will verify the bank notification automatically."
      );

      setAmount("");
      setPaymentMethod("");
      setShowAddMoney(false);

      await loadWallet();
    } catch (error) {
      console.error(
        "WALLET PAYMENT ERROR:",
        error
      );

      alert(
        error.message ||
          "Payment request failed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
  =========================================================
  CLOSE ADD MONEY
  =========================================================
  */

  const closeAddMoney = () => {
    if (submitting) return;

    setShowAddMoney(false);
  };

  /*
  =========================================================
  OPEN WITHDRAWAL NOTICE
  =========================================================
  */

  const openWithdrawNotice = () => {
    setWithdrawAmount("");
    setWithdrawQr("");
    setWithdrawNote("");
    setShowWithdrawNotice(true);
  };

  const submitWithdrawal = async (event) => {
    event.preventDefault();
    if (withdrawSubmitting) return;
    try {
      setWithdrawSubmitting(true);
      await customerRequest("/api/customer/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount: Number(withdrawAmount), qr_code: withdrawQr, note: withdrawNote })
      });
      alert("Withdrawal request submitted. YN Studio will review it.");
      setShowWithdrawNotice(false);
      await loadWallet();
    } catch (error) {
      alert(error.message || "Withdrawal request failed.");
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  /*
  =========================================================
  CLOSE WITHDRAWAL NOTICE
  =========================================================
  */

  const closeWithdrawNotice = () => {
    setShowWithdrawNotice(false);
  };

  /*
  =========================================================
  STATUS ICON
  =========================================================
  */

  const getStatusIcon = (status) => {
    const normalizedStatus =
      String(status || "").toLowerCase();

    if (
      normalizedStatus === "approved" ||
      normalizedStatus === "paid"
    ) {
      return <CheckCircle2 size={17} />;
    }

    if (normalizedStatus === "rejected") {
      return <XCircle size={17} />;
    }

    return <Clock3 size={17} />;
  };

  /*
  =========================================================
  TRANSACTION AMOUNT
  =========================================================
  */

  const getTransactionAmount = (
    transaction
  ) => {
    return Math.abs(
      Number(transaction.amount) || 0
    );
  };

  /*
  =========================================================
  TRANSACTION STATUS
  =========================================================
  */

  const getTransactionStatus = (
    transaction
  ) => {
    return (
      transaction.status ||
      transaction.type ||
      "pending"
    ).toLowerCase();
  };

  /*
  =========================================================
  TRANSACTION DATE
  =========================================================
  */

  const formatTransactionDate = (
    transaction
  ) => {
    const date =
      transaction.created_at ||
      transaction.payment_date ||
      transaction.date;

    if (!date) {
      return "Date unavailable";
    }

    try {
      return new Date(date).toLocaleString(
        "en-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      );
    } catch {
      return String(date);
    }
  };

  /*
  =========================================================
  UI
  =========================================================
  */

  return (
    <div className="customer-wallet-page">

      {/* HEADER */}

      <header className="wallet-header">

        <button
          type="button"
          className="wallet-back-button"
          onClick={() =>
            handleNavigation("/home")
          }
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="wallet-header-title">

          <div className="wallet-header-icon">
            <Wallet size={18} />
          </div>

          <div>
            <strong>
              My Wallet
            </strong>

            <span>
              Manage your savings
            </span>
          </div>

        </div>

        <div className="wallet-header-space" />

      </header>


      {/* WALLET PASSCODE */}

      {showPasscode && (
        <div className="wallet-passcode-overlay">
          <div className="wallet-passcode-card">
            <div className="wallet-passcode-icon">
              <LockKeyhole size={28} />
            </div>

            <span className="wallet-passcode-eyebrow">
              WALLET SECURITY
            </span>

            <h1>Enter your passcode</h1>

            <p>
              Enter your 4-digit passcode to open your wallet.
            </p>

            {passcodeError && (
              <div className="wallet-passcode-error">
                {passcodeError}
              </div>
            )}

            <form onSubmit={verifyWalletPasscode}>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                autoFocus
                value={passcode}
                onChange={(event) => {
                  setPasscodeError("");
                  setPasscode(
                    event.target.value.replace(/\D/g, "").slice(0, 4)
                  );
                }}
                placeholder="••••"
                aria-label="4-digit wallet passcode"
              />

              <button
                type="submit"
                disabled={
                  checkingPasscode ||
                  passcode.length !== 4
                }
              >
                {checkingPasscode
                  ? "Checking..."
                  : "Unlock wallet"}
              </button>

              <button
                type="button"
                className="wallet-passcode-cancel"
                disabled={checkingPasscode}
                onClick={() => handleNavigation("/home")}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MAIN */}

      <main
        className="wallet-content"
        style={{
          display: walletUnlocked ? undefined : "none",
        }}
      >

        {/* BALANCE */}

        <section className="wallet-balance-card">

          <div className="wallet-balance-decoration one" />
          <div className="wallet-balance-decoration two" />

          <div className="wallet-balance-top">

            <div>

              <span className="wallet-balance-label">
                Available Balance
              </span>

              <div className="wallet-balance-amount">

                <span>$</span>

                {loadingWallet
                  ? "..."
                  : Number(
                      balance
                    ).toLocaleString(
                      "en-US",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}

              </div>

            </div>

            <div className="wallet-large-icon">
              <Wallet size={25} />
            </div>

          </div>

          <div className="wallet-balance-bottom">

            <span>
              Your approved savings
            </span>

            <span className="wallet-secure-label">
              <CheckCircle2 size={14} />
              Secure
            </span>

          </div>

        </section>


        {/* ACTIONS */}

        <section className="wallet-action-section">

          {!showAddMoney && (

            <div className="wallet-action-list">

              {/* ADD MONEY */}

              <button
                type="button"
                className="wallet-add-button"
                onClick={() =>
                  setShowAddMoney(true)
                }
              >

                <span className="wallet-add-icon">
                  <Plus size={20} />
                </span>

                <span className="wallet-add-text">

                  <strong>
                    Add Money
                  </strong>

                  <small>
                    Add savings to your YN Studio wallet
                  </small>

                </span>

                <ChevronRight
                  size={19}
                  className="wallet-add-arrow"
                />

              </button>


              {/* SAVING GOALS */}

              <button
                type="button"
                className="wallet-add-button"
                onClick={() => handleNavigation("/customer/savings")}
              >
                <span className="wallet-add-icon"><Target size={20} /></span>
                <span className="wallet-add-text">
                  <strong>Saving Goals</strong>
                  <small>Save for an item and track your progress</small>
                </span>
                <ChevronRight size={19} className="wallet-add-arrow" />
              </button>


              {/* WITHDRAW MONEY */}

              <button
  type="button"
  className="wallet-withdraw-button"
  onClick={() => setShowWithdrawNotice(true)}
>
  <span className="wallet-withdraw-icon">
    <ArrowUpRight size={20} />
  </span>

  <span className="wallet-withdraw-text">
    <strong>
      Withdraw Money
    </strong>

    <small>
      Request a withdrawal from your wallet
    </small>
  </span>

  <ChevronRight
    size={19}
    className="wallet-withdraw-arrow"
  />
</button>

            </div>

          )}


          {/* ADD MONEY FORM */}

          {showAddMoney && (

            <section className="wallet-add-form-card">

              <div className="wallet-form-header">

                <div>

                  <h2>
                    Add Money
                  </h2>

                  <p>
                    Submit a deposit for approval
                  </p>

                </div>

                <button
                  type="button"
                  className="wallet-close-button"
                  onClick={closeAddMoney}
                  disabled={submitting}
                >
                  <X size={18} />
                </button>

              </div>


              <form
                onSubmit={handleSubmit}
              >

                {/* AMOUNT */}

                <div className="wallet-form-group">

                  <label htmlFor="walletAmount">
                    Amount
                  </label>

                  <div className="wallet-amount-input">

                    <span>$</span>

                    <input
                      id="walletAmount"
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(event) =>
                        setAmount(
                          event.target.value
                        )
                      }
                      disabled={submitting}
                    />

                  </div>

                </div>


                {/* PAYMENT METHOD */}

                <div className="wallet-form-group">

                  <label>
                    Payment Method
                  </label>

                  <div className="wallet-payment-methods">

                    <button
                      type="button"
                      className={`wallet-payment-option ${
                        paymentMethod === "qr"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setPaymentMethod("qr")
                      }
                      disabled={submitting}
                    >

                      <Smartphone
                        size={19}
                      />

                      <span>
                        QR Payment
                      </span>

                      {paymentMethod ===
                        "qr" && (
                        <CheckCircle2
                          size={16}
                        />
                      )}

                    </button>


                    <button
                      type="button"
                      className={`wallet-payment-option ${
                        paymentMethod === "bank"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setPaymentMethod("bank")
                      }
                      disabled={submitting}
                    >

                      <CreditCard
                        size={19}
                      />

                      <span>
                        Bank Transfer
                      </span>

                      {paymentMethod ===
                        "bank" && (
                        <CheckCircle2
                          size={16}
                        />
                      )}

                    </button>

                  </div>

                </div>


                {/* QR PAYMENT */}

                {paymentMethod === "qr" && (

                  <div className="wallet-qr-section">

                    <div className="wallet-qr-header">

                      <div className="wallet-qr-icon">
                        <Smartphone size={18} />
                      </div>

                      <div>

                        <strong>
                          Scan to Pay
                        </strong>

                        <span>
                          Scan this QR code using your banking app
                        </span>

                      </div>

                    </div>

                    <div className="wallet-qr-card">

                      <img
                        src={QRCode}
                        alt="YN Studio payment QR code"
                        className="wallet-qr-image"
                      />

                    </div>

                    <div className="wallet-qr-instruction">

                      <span className="wallet-qr-step">
                        1
                      </span>

                      <p>
                        Scan the QR code and complete your payment.
                      </p>

                    </div>

                    <div className="wallet-qr-instruction">
                      <span className="wallet-qr-step">2</span>
                      <p>Pay the exact amount you entered. No receipt upload is required.</p>
                    </div>

                    <div className="wallet-qr-instruction">
                      <span className="wallet-qr-step">3</span>
                      <p>Keep the app open for a moment while the payment notification is verified.</p>
                    </div>

                  </div>

                )}


                {/* AUTOMATIC VERIFICATION NOTICE */}

                <div className="wallet-auto-verify-card">
                  <div className="wallet-auto-verify-icon"><CheckCircle2 size={18} /></div>
                  <div>
                    <strong>Automatic payment verification</strong>
                    <p>After you pay, our secure server watches the configured Telegram payment notification. When the exact amount matches one pending request, the wallet is approved automatically.</p>
                  </div>
                </div>

                {/* NOTICE */}

                <div className="wallet-approval-notice">

                  <Clock3 size={17} />

                  <p>
                    Your deposit is matched against the Telegram payment notification. If the exact amount cannot be matched safely, it stays pending for admin review.
                  </p>

                </div>


                {/* SUBMIT */}

                <button
                  type="submit"
                  className="wallet-submit-button"
                  disabled={submitting}
                >

                  {submitting
                    ? "Submitting..."
                    : "Submit for Approval"}

                </button>

              </form>

            </section>

          )}

        </section>


        {/* HOW IT WORKS */}

        <section className="wallet-section">

          <div className="wallet-section-heading">

            <h2>
              How it works
            </h2>

            <span>
              Simple and secure
            </span>

          </div>


          <div className="wallet-steps">

            <div className="wallet-step">

              <div className="wallet-step-number">
                1
              </div>

              <div>

                <strong>
                  Add money
                </strong>

                <span>
                  Enter the amount you want to save.
                </span>

              </div>

            </div>


            <div className="wallet-step">

              <div className="wallet-step-number">
                2
              </div>

              <div>

                <strong>
                  Automatic verification
                </strong>

                <span>
                  The payment notification is matched automatically.
                </span>

              </div>

            </div>


            <div className="wallet-step">

              <div className="wallet-step-number">
                3
              </div>

              <div>

                <strong>
                  Get approved
                </strong>

                <span>
                  Your balance increases after approval.
                </span>

              </div>

            </div>

          </div>

        </section>


        {/* WITHDRAWALS INFO */}

        <section className="wallet-section">

          <div className="wallet-section-heading">

            <div>

              <h2>
                Withdrawals
              </h2>

              <span>
Available now
              </span>

            </div>

          </div>


          <div className="wallet-withdraw-info-card">

            <div className="wallet-withdraw-info-item">

              <div className="wallet-withdraw-info-number">
                1
              </div>

              <div>

                <strong>
                  Request
                </strong>

                <span>
Submit your amount and payment details for review.
                </span>

              </div>

            </div>


            <div className="wallet-withdraw-info-item">

              <div className="wallet-withdraw-info-number">
                2
              </div>

              <div>

                <strong>
                  Choose your amount
                </strong>

                <span>
Choose any amount up to your available wallet balance.
                </span>

              </div>

            </div>


            <div className="wallet-withdraw-info-item">

              <div className="wallet-withdraw-info-number">
                3
              </div>

              <div>

                <strong>
                  Contact support
                </strong>

                <span>
YN Studio reviews the request and processes the payout.
                </span>

              </div>

            </div>

          </div>

        </section>


        {/* TRANSACTIONS */}

        <section className="wallet-section">

          <div className="wallet-section-heading">

            <div>

              <h2>
                Wallet Activity
              </h2>

              <span>
                Your deposit history
              </span>

            </div>

          </div>


          <div className="wallet-transactions">

            {loadingWallet ? (

              <div className="wallet-empty-state">

                <div className="wallet-empty-icon">
                  <Clock3 size={22} />
                </div>

                <strong>
                  Loading wallet activity...
                </strong>

              </div>

            ) : transactions.length === 0 ? (

              <div className="wallet-empty-state">

                <div className="wallet-empty-icon">
                  <ReceiptText size={22} />
                </div>

                <strong>
                  No wallet activity
                </strong>

                <span>
                  Your deposits will appear here.
                </span>

              </div>

            ) : (

              transactions.map(
                (transaction, index) => {

                  const status =
                    getTransactionStatus(
                      transaction
                    );

                  const transactionAmount =
                    getTransactionAmount(
                      transaction
                    );

                  const isNegative =
                    Number(
                      transaction.amount
                    ) < 0;

                  return (

                    <div
                      className="wallet-transaction"
                      key={
                        transaction.id ||
                        `transaction-${index}`
                      }
                    >

                      <div
                        className={`wallet-transaction-icon ${
                          isNegative
                            ? "withdrawal"
                            : ""
                        }`}
                      >

                        {isNegative ? (

                          <ArrowUpRight size={17} />

                        ) : (

                          <Plus size={17} />

                        )}

                      </div>


                      <div className="wallet-transaction-info">

                        <strong>

                          {transaction.description ||
                            (isNegative
                              ? `Withdrawal $${transactionAmount.toFixed(
                                  2
                                )}`
                              : `Deposit $${transactionAmount.toFixed(
                                  2
                                )}`)}

                        </strong>

                        <span>
                          {formatTransactionDate(
                            transaction
                          )}
                        </span>

                      </div>


                      <div
                        className={`wallet-status ${status}`}
                      >

                        {getStatusIcon(
                          status
                        )}

                        <span>
                          {status}
                        </span>

                      </div>

                    </div>

                  );
                }
              )

            )}

          </div>

        </section>

      </main>


      {/* BOTTOM NAV */}

      <nav className="customer-bottom-nav">

        <button
          type="button"
          className="bottom-nav-item"
          onClick={() =>
            handleNavigation("/home")
          }
        >

          <span className="bottom-nav-icon">
            <Wallet size={20} />
          </span>

          <span>
            Home
          </span>

        </button>


        <button
          type="button"
          className="bottom-nav-item"
          onClick={() =>
            handleNavigation("/orders")
          }
        >

          <span className="bottom-nav-icon">
            <ReceiptText size={20} />
          </span>

          <span>
            Orders
          </span>

        </button>


        <button
          type="button"
          className="bottom-nav-item active"
        >

          <span className="bottom-nav-icon">
            <Wallet size={20} />
          </span>

          <span>
            Wallet
          </span>

        </button>


        <button
          type="button"
          className="bottom-nav-item"
          onClick={() =>
            handleNavigation(
              "/customer/profile"
            )
          }
        >

          <span className="bottom-nav-icon">
            <CreditCard size={20} />
          </span>

          <span>
            Profile
          </span>

        </button>

      </nav>


      {/* =================================================
          WITHDRAWAL MODAL
          ================================================= */}

      {showWithdrawNotice && (
        <div className="wallet-withdraw-modal-backdrop">
          <form className="wallet-withdraw-modal" onSubmit={submitWithdrawal}>
            <div className="wallet-form-header"><div><h2>Withdraw Money</h2><p>Send a withdrawal request for admin approval.</p></div><button type="button" className="wallet-close-button" onClick={closeWithdrawNotice} disabled={withdrawSubmitting}><X size={18}/></button></div>
            <div className="wallet-form-group"><label>Amount</label><div className="wallet-amount-input"><span>$</span><input type="number" min="0.01" step="0.01" max={Number(balance || 0)} value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)} placeholder="0.00" required disabled={withdrawSubmitting}/></div></div>
            <div className="wallet-form-group"><label>Withdrawal QR / payment account</label><textarea className="wallet-withdraw-textarea" value={withdrawQr} onChange={e=>setWithdrawQr(e.target.value)} placeholder="Paste the QR/payment details for the payout" required disabled={withdrawSubmitting}/></div>
            <div className="wallet-form-group"><label>Note <span>(optional)</span></label><textarea className="wallet-withdraw-textarea" value={withdrawNote} onChange={e=>setWithdrawNote(e.target.value)} placeholder="Optional note" disabled={withdrawSubmitting}/></div>
            <div className="wallet-approval-notice"><Clock3 size={17}/><p>Your balance is only deducted after YN Studio approves the withdrawal.</p></div>
            <button className="wallet-submit-button" disabled={withdrawSubmitting}>{withdrawSubmitting ? "Submitting..." : "Request Withdrawal"}</button>
          </form>
        </div>
      )}

    </div>

  );
}

export default CustomerWallet;