import { useEffect, useState } from "react";

import {
  CreditCard,
  Check,
  X,
  Clock,
  ArrowUpRight
} from "lucide-react";


const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Payments() {

  const [payments, setPayments] = useState([]);

  const [loading, setLoading] = useState(true);


  useEffect(() => {

    loadPayments();

  }, []);


  async function loadPayments() {

    try {

      const response = await fetch(
        `${API_URL}/payments`
      );

      const data =
        await response.json();

      setPayments(data);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }


  async function approvePayment(id) {

    const confirmed =
      window.confirm(
        "Approve this payment?"
      );

    if (!confirmed) return;


    try {

      const response = await fetch(
        `${API_URL/payments/${id}/approve`,
        {
          method: "PUT"
        }
      );


      if (!response.ok) {

        const data =
          await response.json();

        alert(
          data.error ||
          "Failed to approve payment"
        );

        return;

      }


      loadPayments();

    } catch (error) {

      console.error(error);

    }

  }


  async function rejectPayment(id) {

    const confirmed =
      window.confirm(
        "Reject this payment?"
      );

    if (!confirmed) return;


    try {

      const response = await fetch(
        `${API_URL/payments/${id}/reject`,
        {
          method: "PUT"
        }
      );


      if (!response.ok) {

        const data =
          await response.json();

        alert(
          data.error ||
          "Failed to reject payment"
        );

        return;

      }


      loadPayments();

    } catch (error) {

      console.error(error);

    }

  }


  const pending =
    payments.filter(
      payment =>
        payment.status === "pending"
    );


  const completed =
    payments.filter(
      payment =>
        payment.status !== "pending"
    );


  return (

    <div className="page-content">


      <div className="page-heading">

        <div>

          <p className="eyebrow">
            FINANCE
          </p>

          <h1>
            Payments
          </h1>

          <p>
            Review customer payment requests.
          </p>

        </div>

      </div>



      {/* PENDING */}

      <section className="payments-section">

        <div className="section-heading">

          <div>

            <h2>
              Pending Payments
            </h2>

            <p>
              Payments waiting for approval.
            </p>

          </div>


          <div className="pending-badge">

            <Clock size={16} />

            {pending.length}

          </div>

        </div>



        {loading ? (

          <div className="empty-payment">
            Loading payments...
          </div>

        ) : pending.length === 0 ? (

          <div className="empty-payment">

            <div className="empty-payment-icon">

              <CreditCard size={24} />

            </div>

            <h3>
              No pending payments
            </h3>

            <p>
              New customer payment requests
              will appear here.
            </p>

          </div>

        ) : (

          <div className="payment-list">

            {pending.map(payment => (

              <div
                className="payment-card"
                key={payment.id}
              >

                <div className="payment-icon">

                  <CreditCard size={22} />

                </div>


                <div className="payment-main">

                  <h3>
                    {payment.full_name}
                  </h3>

                  <p>
                    Customer ID:{" "}
                    {payment.customer_code}
                  </p>

                  <span>
                    {payment.type}
                  </span>

                </div>


                <div className="payment-amount">

                  <strong>
                    +$
                    {Number(
                      payment.amount
                    ).toFixed(2)}
                  </strong>

                  <small>
                    Pending
                  </small>

                </div>


                <div className="payment-actions">

                  <button
                    className="approve-button"
                    onClick={() =>
                      approvePayment(
                        payment.id
                      )
                    }
                  >

                    <Check size={17} />

                    Approve

                  </button>


                  <button
                    className="reject-button"
                    onClick={() =>
                      rejectPayment(
                        payment.id
                      )
                    }
                  >

                    <X size={17} />

                    Reject

                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </section>




      {/* HISTORY */}

      <section className="payments-section">

        <div className="section-heading">

          <div>

            <h2>
              Payment History
            </h2>

            <p>
              Previously processed payments.
            </p>

          </div>

        </div>


        {completed.length === 0 ? (

          <div className="empty-payment">

            No payment history yet.

          </div>

        ) : (

          <div className="payment-list">

            {completed.map(payment => (

              <div
                className="payment-card"
                key={payment.id}
              >

                <div className="payment-icon">

                  <ArrowUpRight size={22} />

                </div>


                <div className="payment-main">

                  <h3>
                    {payment.full_name}
                  </h3>

                  <p>
                    {payment.customer_code}
                  </p>

                </div>


                <div className="payment-amount">

                  <strong>
                    +$
                    {Number(
                      payment.amount
                    ).toFixed(2)}
                  </strong>

                  <small>
                    {payment.status}
                  </small>

                </div>

              </div>

            ))}

          </div>

        )}

      </section>


    </div>

  );

}


export default Payments;