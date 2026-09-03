import { useEffect, useState } from "react";

import {
  Receipt,
  FileText,
  Zap,
  CalendarDays,
  User,
  Printer,
  Download,
  Search,
  ShoppingBag,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Receipts() {
  const [receiptType, setReceiptType] = useState("monthly");

  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);

 const [customer, setCustomer] = useState("");
const [order, setOrder] = useState("");
const [month, setMonth] = useState("");

const [selectedOrderDetails, setSelectedOrderDetails] =
  useState(null);

const [loadingOrderDetails, setLoadingOrderDetails] =
  useState(false);

  const [notes, setNotes] = useState("");

  const [loadingCustomers, setLoadingCustomers] =
    useState(true);

  const [loadingOrders, setLoadingOrders] =
    useState(true);

  const [generated, setGenerated] = useState(false);

  // =====================================================
  // LOAD CUSTOMERS + ORDERS
  // =====================================================

 useEffect(() => {
  loadCustomers();
  loadOrders();

  const params = new URLSearchParams(
    window.location.search
  );

  const customerFromUrl =
    params.get("customer");

  const orderFromUrl =
    params.get("order");

  if (customerFromUrl) {
    setCustomer(customerFromUrl);
  }

  if (orderFromUrl) {
    setOrder(orderFromUrl);
  }
}, []);

  async function loadCustomers() {
    try {
      setLoadingCustomers(true);

      const response = await fetch(
        `${API}/customers`
      );

      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = await response.json();

      setCustomers(
        Array.isArray(data) ? data : []
      );
    } catch (error) {
      console.error(
        "Failed to load customers:",
        error
      );

      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }

  async function loadOrders() {
    try {
      setLoadingOrders(true);

      const response = await fetch(
        `${API}/orders`
      );

      if (!response.ok) {
        throw new Error("Failed to load orders");
      }

      const data = await response.json();

      setOrders(
        Array.isArray(data) ? data : []
      );
    } catch (error) {
      console.error(
        "Failed to load orders:",
        error
      );

      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }
async function loadOrderDetails(orderId) {
  if (!orderId) {
    setSelectedOrderDetails(null);
    return;
  }

  try {
    setLoadingOrderDetails(true);

    const response = await fetch(
      `${API}/orders/${orderId}`
    );

    if (!response.ok) {
      throw new Error(
        "Failed to load order details"
      );
    }

    const data = await response.json();

    setSelectedOrderDetails(data);

    // Make sure the receipt customer always
    // comes from the actual order.
    if (data?.customer_id) {
      setCustomer(
        String(data.customer_id)
      );
    }
  } catch (error) {
    console.error(
      "Failed to load order details:",
      error
    );

    setSelectedOrderDetails(null);
  } finally {
    setLoadingOrderDetails(false);
  }
}useEffect(() => {
  if (!order) {
    setSelectedOrderDetails(null);
    return;
  }

  loadOrderDetails(order);
}, [order]);
  // =====================================================
  // RECEIPT TYPES
  // =====================================================

  const receiptTypes = [
    {
      id: "monthly",
      title: "Monthly Report",
      description: "Design & printing services",
      icon: FileText,
    },
    {
      id: "normal",
      title: "Normal Receipt",
      description: "One-time customer receipt",
      icon: Receipt,
    },
    {
      id: "express",
      title: "Express Receipt",
      description: "Fast order / barcode receipt",
      icon: Zap,
    },
  ];

  // =====================================================
  // SELECTED ORDER
  // =====================================================

 const selectedOrder =
  selectedOrderDetails ||
  orders.find(
    (item) =>
      String(item.id) === String(order)
  ) ||
  null;
  // =====================================================
  // CUSTOMER ORDERS
  // =====================================================

  const customerOrders =
    orders.filter(
      (item) =>
        String(
          item.customer_id
        ) === String(customer)
    );

  // =====================================================
  // MONTHLY ORDERS
  // =====================================================

  const monthlyOrders =
    customerOrders.filter((item) => {
      if (!month) return true;

      const orderDate =
        item.created_at ||
        item.order_date ||
        item.date;

      if (!orderDate) return false;

      return String(orderDate).startsWith(
        month
      );
    });

  // =====================================================
  // NORMAL / EXPRESS ORDERS
  // =====================================================

  const availableOrders =
    customer
      ? customerOrders
      : orders;

  // =====================================================
  // GENERATE
  // =====================================================

  function generateReceipt() {
    if (!customer) {
      alert("Please select a customer.");
      return;
    }

    if (
      receiptType === "normal" ||
      receiptType === "express"
    ) {
      if (!order) {
        alert("Please select an order.");
        return;
      }
    }

    if (
      receiptType === "monthly" &&
      !month
    ) {
      alert("Please select the report month.");
      return;
    }

    setGenerated(true);
  }

  // =====================================================
  // CLEAR
  // =====================================================

function clearReceipt() {
  setCustomer("");
  setOrder("");
  setMonth("");
  setNotes("");
  setGenerated(false);
  setSelectedOrderDetails(null);
}

  // =====================================================
  // PRINT
  // =====================================================

  function printReceipt() {
    window.print();
  }

  // =====================================================
  // MONTH NAME
  // =====================================================

  function getMonthName() {
    if (!month) return "Monthly";

    return new Date(
      `${month}-01T00:00:00`
    ).toLocaleString("en-US", {
      month: "long",
    });
  }

  // =====================================================
  // CUSTOMER NAME
  // =====================================================

  const selectedCustomer =
    customers.find(
      (item) =>
        String(item.id) ===
        String(customer)
    );

  const customerName =
    selectedCustomer?.full_name ||
    "Customer Name";

  // =====================================================
  // ORDER NUMBER
  // =====================================================

  function getOrderNumber(item) {
    if (!item) return "—";

    return (
      item.order_number ||
      item.order_code ||
      `ORD-${String(item.id).padStart(
        6,
        "0"
      )}`
    );
  }

  // =====================================================
  // DATE
  // =====================================================

  function getOrderDate(item) {
    if (!item) return "—";

    const date =
      item.created_at ||
      item.order_date ||
      item.date;

    if (!date) return "—";

    return new Date(date).toLocaleDateString(
      "en-US"
    );
  }

  // =====================================================
  // HEADER
  // =====================================================

  return (
    <div className="receipts-page">

      <div className="receipts-header">

        <div>
          <p className="eyebrow">
            DOCUMENTS
          </p>

          <h1>
            Receipts
          </h1>

          <p className="receipts-subtitle">
            Create, preview and print customer
            receipts.
          </p>
        </div>

        <div className="receipts-header-icon">
          <Receipt size={24} />
        </div>

      </div>

      {/* =================================================
          RECEIPT TYPE
      ================================================= */}

      <section className="receipt-type-section">

        <div className="receipt-section-heading">

          <div>
            <h2>
              Receipt Type
            </h2>

            <p>
              Choose the type of receipt you
              want to create.
            </p>
          </div>

        </div>

        <div className="receipt-type-grid">

          {receiptTypes.map((type) => {

            const Icon = type.icon;

            const active =
              receiptType === type.id;

            return (
              <button
                key={type.id}
                type="button"
                className={
                  active
                    ? "receipt-type-card active"
                    : "receipt-type-card"
                }
                onClick={() => {
                  setReceiptType(type.id);
                  setOrder("");
                  setGenerated(false);
                }}
              >

                <div className="receipt-type-icon">
                  <Icon size={21} />
                </div>

                <div className="receipt-type-content">

                  <strong>
                    {type.title}
                  </strong>

                  <span>
                    {type.description}
                  </span>

                </div>

                <div className="receipt-type-radio">
                  {active && <div />}
                </div>

              </button>
            );
          })}

        </div>

      </section>

      {/* =================================================
          WORKSPACE
      ================================================= */}

      <div className="receipt-workspace">

        {/* =================================================
            FORM
        ================================================= */}

        <section className="receipt-form-card">

          <div className="receipt-card-heading">

            <div className="receipt-card-heading-icon">
              <FileText size={19} />
            </div>

            <div>

              <h2>
                Receipt Information
              </h2>

              <p>
                Choose the customer and order
                for this receipt.
              </p>

            </div>

          </div>

          <div className="receipt-form-body">

            {/* CUSTOMER */}

            <div className="receipt-field">

              <label>
                Customer
              </label>

              <div className="receipt-input">

                <User size={17} />

                <select
                  value={customer}
                  onChange={(e) => {
                    setCustomer(
                      e.target.value
                    );

                    setOrder("");
                    setGenerated(false);
                  }}
                >

                  <option value="">
                    {loadingCustomers
                      ? "Loading customers..."
                      : "Select customer"}
                  </option>

                  {customers.map(
                    (item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.full_name}
                      </option>
                    )
                  )}

                </select>

              </div>

            </div>

            {/* MONTH */}

            {receiptType ===
              "monthly" && (
              <div className="receipt-field">

                <label>
                  Report Month
                </label>

                <div className="receipt-input">

                  <CalendarDays
                    size={17}
                  />

                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      setMonth(
                        e.target.value
                      );
                      setGenerated(false);
                    }}
                  />

                </div>

                <span className="receipt-field-hint">

                  The report will be named:
                  
                  <strong>
                    {" "}
                    {getMonthName()} Report
                  </strong>

                </span>

              </div>
            )}

            {/* NORMAL / EXPRESS ORDER */}

            {(receiptType ===
              "normal" ||
              receiptType ===
                "express") && (
              <div className="receipt-field">

                <label>
                  Order
                </label>

                <div className="receipt-input">

                  <ShoppingBag
                    size={17}
                  />

                  <select
                    value={order}
                   onChange={(e) => {
  const selectedOrderId =
    e.target.value;

  setOrder(selectedOrderId);
  setGenerated(false);

  const selected =
    orders.find(
      (item) =>
        String(item.id) ===
        String(selectedOrderId)
    );

  if (selected?.customer_id) {
    setCustomer(
      String(selected.customer_id)
    );
  }
}}
                  >

                    <option value="">
                      {loadingOrders
                        ? "Loading orders..."
                        : "Select order"}
                    </option>

                    {availableOrders.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {getOrderNumber(
                            item
                          )}{" "}
                          —{" "}
                          {item.service_name ||
                            item.service ||
                            "Order"}
                        </option>
                      )
                    )}

                  </select>

                </div>

              </div>
            )}

            {/* EXPRESS */}

            {receiptType ===
              "express" && (
              <div className="receipt-field">

                <label>
                  Order Number
                </label>

                <div className="receipt-input">

                  <Search size={17} />

                  <input
                    type="text"
                    value={
                      selectedOrder
                        ? getOrderNumber(
                            selectedOrder
                          )
                        : ""
                    }
                    readOnly
                    placeholder="Select an order"
                  />

                </div>

                <span className="receipt-field-hint">
                  A barcode will be generated
                  from the order number later.
                </span>

              </div>
            )}

            {/* MONTHLY ORDER COUNT */}

            {receiptType ===
              "monthly" &&
              customer &&
              month && (
                <div className="receipt-order-summary">

                  <div>
                    <ShoppingBag
                      size={18}
                    />
                  </div>

                  <span>
                    Orders in this report
                  </span>

                  <strong>
                    {monthlyOrders.length}
                  </strong>

                </div>
              )}

            {/* NOTES */}

            <div className="receipt-field">

              <label>
                Notes
              </label>

              <textarea
                placeholder="Optional receipt notes..."
                rows={4}
                value={notes}
                onChange={(e) =>
                  setNotes(
                    e.target.value
                  )
                }
              />

            </div>

            {/* ACTIONS */}

            <div className="receipt-actions">

              <button
                type="button"
                className="receipt-secondary-button"
                onClick={clearReceipt}
              >
                Clear
              </button>

              <button
                type="button"
                className="receipt-primary-button"
                onClick={generateReceipt}
              >
                <Receipt size={17} />
                Generate Receipt
              </button>

            </div>

          </div>

        </section>

        {/* =================================================
            PREVIEW
        ================================================= */}

        <section className="receipt-preview-card">

          <div className="receipt-preview-header">

            <div>

              <p className="eyebrow">
                PREVIEW
              </p>

              <h2>
                Receipt Preview
              </h2>

            </div>

            {generated && (
              <div className="receipt-preview-actions">

                <button
                  type="button"
                  title="Print"
                  onClick={
                    printReceipt
                  }
                >
                  <Printer size={17} />
                </button>

                <button
                  type="button"
                  title="Download"
                  onClick={() =>
                    window.print()
                  }
                >
                  <Download size={17} />
                </button>

              </div>
            )}

          </div>

          {/* =================================================
              PAPER
          ================================================= */}

          {!generated ? (

            <div className="receipt-preview-empty">

              <div className="receipt-preview-empty-icon">
                <Receipt size={28} />
              </div>

              <h3>
                No receipt selected
              </h3>

              <p>
                Choose a customer and
                receipt information, then
                click Generate Receipt.
              </p>

            </div>

          ) : (

            <div className="receipt-paper">

              {/* TOP */}

              <div className="receipt-paper-top">

                <div>
                  <div className="receipt-logo-placeholder">
                    YN
                  </div>
                </div>

                <div className="receipt-paper-title">

                  <strong>
                    YN STUDIO
                  </strong>

                  <span>
                    Design & Printing
                  </span>

                </div>

              </div>

              <div className="receipt-paper-divider" />

              {/* TITLE */}

              <div className="receipt-paper-heading">

                <span>

                  {receiptType ===
                    "monthly"
                    ? `${getMonthName()} Report`
                    : receiptType ===
                      "express"
                    ? "Express Receipt"
                    : "Receipt"}

                </span>

                <small>
                  {receiptType ===
                  "express"
                    ? "EXPRESS"
                    : "RECEIPT"}
                </small>

              </div>

              {/* INFO */}

              <div className="receipt-paper-info">

                <div>

                  <span>
                    Customer
                  </span>

                  <strong>
                    {customerName}
                  </strong>

                </div>

                <div>

                  <span>
                    Date
                  </span>

                  <strong>
                    {new Date().toLocaleDateString(
                      "en-US"
                    )}
                  </strong>

                </div>

              </div>

              {/* =================================================
                  MONTHLY TABLE
              ================================================= */}

              {receiptType ===
              "monthly" ? (

                <div className="receipt-table">

                  <div className="receipt-table-row receipt-table-head">

                    <span>
                      #
                    </span>

                    <span>
                      File Name
                    </span>

                    <span>
                      Approval Date
                    </span>

                    <span>
                      Poster
                    </span>

                  </div>

                  {monthlyOrders.length ===
                  0 ? (

                    <div className="receipt-table-row">

                      <span>
                        —
                      </span>

                      <span>
                        No orders
                      </span>

                      <span>
                        —
                      </span>

                      <div className="poster-placeholder">
                        —
                      </div>

                    </div>

                  ) : (

                    monthlyOrders.map(
                      (item, index) => (

                        <div
                          className="receipt-table-row"
                          key={item.id}
                        >

                          <span>
                            {index + 1}
                          </span>

                          <span>
                            {item.file_name ||
                              item.filename ||
                              item.poster_name ||
                              item.service_name ||
                              getOrderNumber(
                                item
                              )}
                          </span>

                          <span>
                            {item.approved_at
                              ? new Date(
                                  item.approved_at
                                ).toLocaleDateString(
                                  "en-US"
                                )
                              : "—"}
                          </span>

                          <div className="poster-placeholder">
                            Poster
                          </div>

                        </div>

                      )
                    )
                  )}

                </div>

              ) : (

                /* =================================================
                   NORMAL / EXPRESS
                ================================================= */

                <div className="normal-receipt-items">

                  <div className="normal-receipt-item">

                    <span>
                      Order
                    </span>

                    <strong>
                      {getOrderNumber(
                        selectedOrder
                      )}
                    </strong>

                  </div>

                  <div className="normal-receipt-item">

                    <span>
                      Service
                    </span>

                    <strong>
                      {selectedOrder?.service_name ||
                        selectedOrder?.service ||
                        "—"}
                    </strong>

                  </div>

                  <div className="normal-receipt-item">

                    <span>
                      Quantity
                    </span>

                    <strong>
                      {selectedOrder?.quantity ||
                        "—"}
                    </strong>

                  </div>

                  <div className="normal-receipt-item">

                    <span>
                      Total
                    </span>

                    <strong>
                      $
                      {Number(
                        selectedOrder?.total ||
                          selectedOrder?.price ||
                          0
                      ).toFixed(2)}
                    </strong>

                  </div>

                </div>
              )}

              {/* NOTES */}

              {notes && (
                <div className="receipt-paper-notes">

                  <span>
                    Notes
                  </span>

                  <p>
                    {notes}
                  </p>

                </div>
              )}

              {/* FOOTER */}

              <div className="receipt-paper-footer">

                <span>
                  Thank you for choosing
                  YN Studio.
                </span>

                <strong>
                  YN STUDIO
                </strong>

              </div>

            </div>
          )}

        </section>

      </div>

    </div>
  );
}

export default Receipts;