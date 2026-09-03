import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  Search,
  RefreshCw,
  MapPin,
  Package,
  User,
  Phone,
  DollarSign,
  ChevronDown,
  CheckCircle2,
  Clock,
  Truck,
  Warehouse,
  ShieldCheck,
  Upload,
  Image as ImageIcon,
  X,
  Eye,
  ExternalLink,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/*
=========================================================
VIETNAM ORDER WORKFLOW
=========================================================

1. pending_payment
2. ordered
3. arrive_vietnam_warehouse
4. delivering
5. customs_clearance
6. customs_clearance_done
7. arrive_pp_warehouse
8. delivering_to_customer
9. completed

IMPORTANT:
- Payment approval is handled by the Payments page.
- Once payment is approved, the backend should set
  the Vietnam order to "ordered".
- "completed" requires a proof image.
=========================================================
*/

const VIETNAM_STATUSES = [
  {
    value: "pending_payment",
    label: "Pending Payment",
    icon: Clock,
  },
  {
    value: "ordered",
    label: "Ordered",
    icon: CheckCircle2,
  },
  {
    value: "arrive_vietnam_warehouse",
    label: "Arrive in Vietnam Warehouse",
    icon: Warehouse,
  },
  {
    value: "delivering",
    label: "Delivering",
    icon: Truck,
  },
  {
    value: "customs_clearance",
    label: "Custom Import Clearance",
    icon: ShieldCheck,
  },
  {
    value: "customs_clearance_done",
    label: "Done Custom Import Clearance",
    icon: CheckCircle2,
  },
  {
    value: "arrive_pp_warehouse",
    label: "Arrive in PP-Warehouse",
    icon: Warehouse,
  },
  {
    value: "delivering_to_customer",
    label: "Delivering to Customer",
    icon: Truck,
  },
  {
    value: "completed",
    label: "Complete",
    icon: CheckCircle2,
  },
];

function VietnamOrders() {
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [selectedOrder, setSelectedOrder] =
    useState(null);

  const [proofModal, setProofModal] =
    useState(false);

  const [proofFile, setProofFile] =
    useState(null);

  const [proofPreview, setProofPreview] =
    useState("");

  const [uploadingProof, setUploadingProof] =
    useState(false);

  const fileInputRef = useRef(null);

  /*
  =========================================================
  LOAD VIETNAM ORDERS
  =========================================================
  */

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/orders`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load orders."
        );
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.orders)
        ? data.orders
        : [];

      /*
      -------------------------------------------------------
      IMPORTANT

      Only keep orders linked to a Vietnam request.

      The backend may return request_type directly.
      -------------------------------------------------------
      */

      const vietnamOrders = list.filter(
        (order) => {
          const type =
            String(
              order?.request_type ||
                order?.service_type ||
                ""
            ).toLowerCase();

          return (
            type === "vietnam" ||
            type === "vietnam_purchase"
          );
        }
      );

      setOrders(vietnamOrders);
    } catch (err) {
      console.error(
        "LOAD VIETNAM ORDERS ERROR:",
        err
      );

      setError(
        err.message ||
          "Failed to load Vietnam orders."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  /*
  =========================================================
  REFRESH
  =========================================================
  */

  async function refreshOrders() {
    setRefreshing(true);
    await loadOrders();
  }

  /*
  =========================================================
  NORMALIZE STATUS
  =========================================================
  */

  function getStatus(order) {
    const status =
      String(
        order?.vietnam_status ||
          order?.status ||
          "pending_payment"
      ).toLowerCase();

    /*
    Existing normal order created from the quote
    starts as pending_payment.
    */

    if (
      status === "processing" &&
      order?.payment_status === "paid"
    ) {
      return "ordered";
    }

    return status;
  }

  /*
  =========================================================
  STATUS LABEL
  =========================================================
  */

  function getStatusLabel(status) {
    const found =
      VIETNAM_STATUSES.find(
        (item) =>
          item.value === status
      );

    return (
      found?.label ||
      status
        ?.replaceAll("_", " ")
        ?.replace(
          /\b\w/g,
          (char) =>
            char.toUpperCase()
        ) ||
      "Unknown"
    );
  }

  /*
  =========================================================
  STATUS INDEX
  =========================================================
  */

  function getStatusIndex(status) {
    return VIETNAM_STATUSES.findIndex(
      (item) =>
        item.value === status
    );
  }

  /*
  =========================================================
  PAYMENT
  =========================================================
  */

  function isPaid(order) {
    return (
      order?.payment_status ===
        "paid" ||
      getStatus(order) !==
        "pending_payment"
    );
  }

  /*
  =========================================================
  CUSTOMER
  =========================================================
  */

  function getCustomerName(order) {
    return (
      order?.customer_name ||
      order?.full_name ||
      "Unknown Customer"
    );
  }

  function getCustomerCode(order) {
    return (
      order?.customer_code ||
      order?.customer_id ||
      "—"
    );
  }

  /*
  =========================================================
  ORDER NUMBER
  =========================================================
  */

  function getOrderNumber(order) {
    return (
      order?.public_order_number ||
      order?.order_number ||
      order?.id ||
      "—"
    );
  }

  /*
  =========================================================
  AMOUNT
  =========================================================
  */

  function getAmount(order) {
    return Number(
      order?.payment_amount ??
        order?.total ??
        0
    );
  }

  /*
  =========================================================
  DATE
  =========================================================
  */

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString(
      "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  /*
  =========================================================
  SEARCH
  =========================================================
  */

  const filteredOrders =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return orders;
      }

      return orders.filter(
        (order) => {
          const text = `
            ${getCustomerName(order)}
            ${getCustomerCode(order)}
            ${getOrderNumber(order)}
            ${order?.phone || ""}
            ${order?.product_link || ""}
            ${order?.details || ""}
            ${getStatusLabel(getStatus(order))}
          `.toLowerCase();

          return text.includes(
            query
          );
        }
      );
    }, [orders, search]);

  /*
  =========================================================
  SUMMARY
  =========================================================
  */

  const pendingPaymentCount =
    orders.filter(
      (order) =>
        getStatus(order) ===
        "pending_payment"
    ).length;

  const orderedCount =
    orders.filter(
      (order) =>
        getStatus(order) ===
        "ordered"
    ).length;

  const processingCount =
    orders.filter(
      (order) =>
        getStatus(order) !==
          "pending_payment" &&
        getStatus(order) !==
          "completed"
    ).length;

  const completedCount =
    orders.filter(
      (order) =>
        getStatus(order) ===
        "completed"
    ).length;

  /*
  =========================================================
  CHANGE STATUS
  =========================================================
  */

  async function changeStatus(
    order,
    newStatus
  ) {
    const currentStatus =
      getStatus(order);

    const currentIndex =
      getStatusIndex(
        currentStatus
      );

    const newIndex =
      getStatusIndex(
        newStatus
      );


    try {
      const response =
        await fetch(
          `${API_URL}/orders/${order.id}/vietnam-status`,
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              status:
                newStatus,
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
            "Failed to update Vietnam order status."
        );
      }

      setOrders(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              order.id
                ? {
                    ...item,
                    ...(data.order ||
                      {}),
                    vietnam_status:
                      newStatus,
                  }
                : item
          )
      );
    } catch (err) {
      console.error(
        "CHANGE VIETNAM STATUS ERROR:",
        err
      );

      alert(
        err.message ||
          "Failed to update order status."
      );
    }
  }

  /*
  =========================================================
  OPEN PROOF MODAL
  =========================================================
  */

  function openProofUpload(
    order
  ) {
    setSelectedOrder(order);
    setProofFile(null);
    setProofPreview("");
    setProofModal(true);
  }

  /*
  =========================================================
  CLOSE PROOF MODAL
  =========================================================
  */

  function closeProofModal() {
    if (
      uploadingProof
    ) {
      return;
    }

    setProofModal(false);
    setProofFile(null);
    setProofPreview("");
  }

  /*
  =========================================================
  SELECT PROOF
  =========================================================
  */

  function handleProofChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      alert(
        "Please select an image file."
      );

      return;
    }

    setProofFile(file);

    const previewUrl =
      URL.createObjectURL(
        file
      );

    setProofPreview(
      previewUrl
    );
  }

  /*
  =========================================================
  UPLOAD PROOF
  =========================================================
  */

  async function uploadProof() {
    if (
      !selectedOrder
    ) {
      return;
    }

    if (!proofFile) {
      alert(
        "Please select a proof picture."
      );

      return;
    }

    try {
      setUploadingProof(
        true
      );

      const formData =
        new FormData();

      formData.append(
        "proof",
        proofFile
      );

      const response =
        await fetch(
          `${API_URL}/orders/${selectedOrder.id}/vietnam-proof`,
          {
            method: "POST",
            body: formData,
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
            "Failed to upload proof."
        );
      }

      const updatedOrder =
        data.order ||
        data;

      /*
      -------------------------------------------------------
      UPDATE LOCAL ORDER
      -------------------------------------------------------
      */

      setOrders(
        (current) =>
          current.map(
            (order) =>
              order.id ===
              selectedOrder.id
                ? {
                    ...order,
                    ...updatedOrder,
                    vietnam_proof:
                      updatedOrder.vietnam_proof,
                  }
                : order
          )
      );

      /*
      -------------------------------------------------------
      UPDATE SELECTED ORDER
      -------------------------------------------------------
      */

      setSelectedOrder(
        (current) =>
          current
            ? {
                ...current,
                ...updatedOrder,
              }
            : current
      );

      alert(
        "Proof uploaded successfully."
      );

      setProofFile(null);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    } catch (err) {
      console.error(
        "UPLOAD VIETNAM PROOF ERROR:",
        err
      );

      alert(
        err.message ||
          "Failed to upload proof."
      );
    } finally {
      setUploadingProof(
        false
      );
    }
  }

  /*
  =========================================================
  COMPLETE AFTER PROOF
  =========================================================
  */

  async function completeOrder() {
    if (
      !selectedOrder
    ) {
      return;
    }

    if (
      !selectedOrder
        .vietnam_proof
    ) {
      alert(
        "A proof picture is required before completing this order."
      );

      return;
    }

    await changeStatus(
      selectedOrder,
      "completed"
    );

    closeProofModal();
  }

  /*
  =========================================================
  RENDER STATUS SELECT
  =========================================================
  */

  function StatusControl({
    order,
  }) {
    const status =
      getStatus(order);

    const currentIndex =
      getStatusIndex(status);

    const nextStatus =
      VIETNAM_STATUSES[
        currentIndex + 1
      ];

    const isCompleted =
      status ===
      "completed";

    return (
      <div className="vn-status-control">
        <select
          value={status}
          onChange={(event) =>
            changeStatus(
              order,
              event.target.value
            )
          }
        >
          {VIETNAM_STATUSES.map(
            (item, index) => {
              return (
                <option
                  key={
                    item.value
                  }
                  value={
                    item.value
                  }
                >
                  {item.label}
                </option>
              );
            }
          )}
        </select>

        <ChevronDown
          size={16}
          className="vn-status-chevron"
        />

        {!isCompleted &&
          nextStatus && (
            <button
              type="button"
              className="vn-next-button"
              onClick={() =>
                changeStatus(
                  order,
                  nextStatus.value
                )
              }
            >
              {nextStatus.value ===
              "completed"
                ? "Complete"
                : `Next: ${nextStatus.label}`}
            </button>
          )}

        {status ===
          "delivering_to_customer" &&
          !order?.vietnam_proof && (
            <button
              type="button"
              className="vn-proof-button"
              onClick={() =>
                openProofUpload(
                  order
                )
              }
            >
              <Upload
                size={15}
              />
              Upload Proof
            </button>
          )}

        {status ===
          "delivering_to_customer" &&
          order?.vietnam_proof && (
            <button
              type="button"
              className="vn-complete-button"
              onClick={() => {
                setSelectedOrder(
                  order
                );
                setProofModal(
                  true
                );
              }}
            >
              <CheckCircle2
                size={15}
              />
              Complete
            </button>
          )}
      </div>
    );
  }

  /*
  =========================================================
  ORDER CARD
  =========================================================
  */

  function OrderCard({
    order,
  }) {
    const status =
      getStatus(order);

    const statusIndex =
      getStatusIndex(status);

    const progress =
      statusIndex >= 0
        ? ((statusIndex + 1) /
            VIETNAM_STATUSES.length) *
          100
        : 0;

    return (
      <div className="vn-order-card">
        {/* HEADER */}

        <div className="vn-order-card-header">
          <div className="vn-order-number">
            <div className="vn-order-icon">
              <Package
                size={21}
              />
            </div>

            <div>
              <span>
                ORDER
              </span>

              <h3>
                #
                {getOrderNumber(
                  order
                )}
              </h3>
            </div>
          </div>

          <div
            className={`vn-status-badge vn-status-${status}`}
          >
            {getStatusLabel(
              status
            )}
          </div>
        </div>

        {/* PROGRESS */}

        <div className="vn-progress">
          <div className="vn-progress-track">
            <div
              className="vn-progress-fill"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="vn-progress-label">
            <span>
              Step{" "}
              {statusIndex + 1}{" "}
              of{" "}
              {
                VIETNAM_STATUSES.length
              }
            </span>

            <strong>
              {Math.round(
                progress
              )}
              %
            </strong>
          </div>
        </div>

        {/* INFO */}

        <div className="vn-order-info-grid">
          <div className="vn-info-box">
            <div className="vn-info-icon">
              <User
                size={17}
              />
            </div>

            <div>
              <span>
                CUSTOMER
              </span>

              <strong>
                {getCustomerName(
                  order
                )}
              </strong>

              <small>
                {getCustomerCode(
                  order
                )}
              </small>
            </div>
          </div>

          <div className="vn-info-box">
            <div className="vn-info-icon">
              <Phone
                size={17}
              />
            </div>

            <div>
              <span>
                PHONE
              </span>

              <strong>
                {order?.phone ||
                  "—"}
              </strong>
            </div>
          </div>

          <div className="vn-info-box">
            <div className="vn-info-icon">
              <DollarSign
                size={17}
              />
            </div>

            <div>
              <span>
                TOTAL
              </span>

              <strong>
                $
                {getAmount(
                  order
                ).toFixed(2)}
              </strong>

              <small>
                {order?.payment_status ||
                  "unpaid"}
              </small>
            </div>
          </div>

          <div className="vn-info-box">
            <div className="vn-info-icon">
              <MapPin
                size={17}
              />
            </div>

            <div>
              <span>
                ROUTE
              </span>

              <strong>
                Vietnam → PP
              </strong>
            </div>
          </div>
        </div>

        {/* ORDER DETAILS */}

        {(order?.product_link ||
          order?.details ||
          order?.notes) && (
          <div className="vn-order-details">
            <div className="vn-details-heading">
              <Package
                size={16}
              />

              <span>
                ORDER DETAILS
              </span>
            </div>

            {order?.product_link && (
              <a
                href={
                  order.product_link
                }
                target="_blank"
                rel="noreferrer"
                className="vn-product-link"
              >
                {order.product_link}

                <ExternalLink
                  size={13}
                />
              </a>
            )}

            {order?.details && (
              <p>
                {order.details}
              </p>
            )}

            {!order?.details &&
              order?.notes && (
                <p>
                  {order.notes}
                </p>
              )}
          </div>
        )}

        {/* PAYMENT */}

        <div className="vn-payment-row">
          <div>
            <span>
              PAYMENT
            </span>

            <strong
              className={
                isPaid(order)
                  ? "vn-paid"
                  : "vn-unpaid"
              }
            >
              {isPaid(order)
                ? "PAID"
                : "WAITING FOR PAYMENT"}
            </strong>
          </div>

          {order?.payment_receipt && (
            <button
              type="button"
              className="vn-view-payment"
              onClick={() =>
                window.open(
                  order.payment_receipt,
                  "_blank"
                )
              }
            >
              <Eye
                size={15}
              />

              View Payment
            </button>
          )}
        </div>

        {/* STATUS CONTROL */}

        <div className="vn-status-section">
          <div>
            <span className="vn-section-label">
              ORDER PROGRESS
            </span>

            <p>
              Update the Vietnam
              delivery stage.
            </p>
          </div>

          <StatusControl
            order={order}
          />
        </div>

        {/* PROOF */}

        {order?.vietnam_proof && (
          <div className="vn-proof-existing">
            <div>
              <ImageIcon
                size={17}
              />

              <div>
                <span>
                  DELIVERY PROOF
                </span>

                <strong>
                  Proof uploaded
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                window.open(
                  order.vietnam_proof,
                  "_blank"
                )
              }
            >
              <Eye
                size={15}
              />

              View
            </button>
          </div>
        )}

        {/* FOOTER */}

        <div className="vn-order-footer">
          <span>
            Created:{" "}
            {formatDate(
              order?.created_at
            )}
          </span>

          {order?.updated_at && (
            <span>
              Updated:{" "}
              {formatDate(
                order.updated_at
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  /*
  =========================================================
  PAGE
  =========================================================
  */

  return (
    <div className="page-content vn-orders-page">

      {/* HEADER */}

      <div className="vn-page-header">
        <div>
          <p className="eyebrow">
            VIETNAM LOGISTICS
          </p>

          <h1>
            Vietnam Orders
          </h1>

          <p>
            Manage Vietnam purchases
            from quotation approval
            through delivery to the
            customer.
          </p>
        </div>

        <button
          type="button"
          className="vn-refresh-button"
          onClick={
            refreshOrders
          }
          disabled={
            loading ||
            refreshing
          }
        >
          <RefreshCw
            size={17}
            className={
              refreshing
                ? "vn-spin"
                : ""
            }
          />

          Refresh
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="vn-error">
          {error}
        </div>
      )}

      {/* SUMMARY */}

      <div className="vn-summary-grid">

        <div className="vn-summary-card">
          <div className="vn-summary-icon">
            <Package
              size={20}
            />
          </div>

          <div>
            <span>
              Total Orders
            </span>

            <strong>
              {orders.length}
            </strong>
          </div>
        </div>

        <div className="vn-summary-card">
          <div className="vn-summary-icon">
            <Clock
              size={20}
            />
          </div>

          <div>
            <span>
              Pending Payment
            </span>

            <strong>
              {pendingPaymentCount}
            </strong>
          </div>
        </div>

        <div className="vn-summary-card">
          <div className="vn-summary-icon">
            <Truck
              size={20}
            />
          </div>

          <div>
            <span>
              Processing
            </span>

            <strong>
              {processingCount}
            </strong>
          </div>
        </div>

        <div className="vn-summary-card">
          <div className="vn-summary-icon">
            <CheckCircle2
              size={20}
            />
          </div>

          <div>
            <span>
              Completed
            </span>

            <strong>
              {completedCount}
            </strong>
          </div>
        </div>

      </div>

      {/* EXTRA SUMMARY */}

      <div className="vn-mini-summary">

        <div>
          <span>
            Ordered
          </span>

          <strong>
            {orderedCount}
          </strong>
        </div>

        <div>
          <span>
            Vietnam → PP
          </span>

          <strong>
            Active
          </strong>
        </div>

        <div>
          <span>
            Proof Required
          </span>

          <strong>
            Before Complete
          </strong>
        </div>

      </div>

      {/* LIST */}

      <div className="vn-orders-container">

        <div className="vn-orders-heading">

          <div>
            <h2>
              Vietnam Order List
            </h2>

            <p>
              Orders created from
              Vietnam customer
              requests.
            </p>
          </div>

          <div className="vn-search">
            <Search
              size={17}
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search customer, order..."
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch("")
                }
              >
                <X
                  size={14}
                />
              </button>
            )}
          </div>

        </div>

        {loading ? (
          <div className="vn-empty">
            <RefreshCw
              size={27}
              className="vn-spin"
            />

            <h3>
              Loading Vietnam
              orders...
            </h3>
          </div>
        ) : filteredOrders.length ===
          0 ? (
          <div className="vn-empty">

            <div className="vn-empty-icon">
              VN
            </div>

            <h3>
              No Vietnam Orders
            </h3>

            <p>
              When a customer creates
              a Vietnam request and
              accepts your quotation,
              the resulting order will
              appear here.
            </p>

            <button
              type="button"
              className="vn-refresh-button"
              onClick={
                refreshOrders
              }
            >
              <RefreshCw
                size={16}
              />

              Refresh Orders
            </button>

          </div>
        ) : (
          <div className="vn-order-list">
            {filteredOrders.map(
              (order) => (
                <OrderCard
                  key={
                    order.id
                  }
                  order={
                    order
                  }
                />
              )
            )}
          </div>
        )}

      </div>

      {/* PROOF MODAL */}

      {proofModal &&
        selectedOrder && (
          <div
            className="vn-modal-overlay"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeProofModal();
              }
            }}
          >
            <div className="vn-proof-modal">

              <button
                type="button"
                className="vn-modal-close"
                onClick={
                  closeProofModal
                }
              >
                <X
                  size={20}
                />
              </button>

              <div className="vn-modal-icon">
                <ImageIcon
                  size={25}
                />
              </div>

              <p className="eyebrow">
                DELIVERY PROOF
              </p>

              <h2>
                Complete Vietnam
                Order
              </h2>

              <p className="vn-modal-description">
                Upload a picture proving
                that the order has been
                delivered to the customer.
                The order cannot be
                completed without this
                proof.
              </p>

              <div className="vn-modal-order">
                <strong>
                  Order #
                  {getOrderNumber(
                    selectedOrder
                  )}
                </strong>

                <span>
                  {
                    getCustomerName(
                      selectedOrder
                    )
                  }
                </span>
              </div>

              {/* PREVIEW */}

              {proofPreview ? (
                <div className="vn-proof-preview">
                  <img
                    src={
                      proofPreview
                    }
                    alt="Delivery proof preview"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setProofFile(
                        null
                      );
                      setProofPreview(
                        ""
                      );

                      if (
                        fileInputRef.current
                      ) {
                        fileInputRef.current.value =
                          "";
                      }
                    }}
                  >
                    <X
                      size={16}
                    />

                    Remove
                  </button>
                </div>
              ) : selectedOrder?.vietnam_proof ? (
                <div className="vn-existing-proof">
                  <img
                    src={
                      selectedOrder.vietnam_proof
                    }
                    alt="Existing delivery proof"
                  />

                  <div>
                    <strong>
                      Proof already
                      uploaded
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          selectedOrder.vietnam_proof,
                          "_blank"
                        )
                      }
                    >
                      <Eye
                        size={15}
                      />

                      View Proof
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="vn-upload-area"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                >
                  <Upload
                    size={28}
                  />

                  <strong>
                    Choose Proof Picture
                  </strong>

                  <span>
                    JPG, PNG or WEBP
                  </span>
                </button>
              )}

              <input
                ref={
                  fileInputRef
                }
                type="file"
                accept="image/*"
                onChange={
                  handleProofChange
                }
                style={{
                  display: "none",
                }}
              />

              <div className="vn-modal-actions">

                <button
                  type="button"
                  className="vn-cancel-button"
                  onClick={
                    closeProofModal
                  }
                  disabled={
                    uploadingProof
                  }
                >
                  Cancel
                </button>

                {!selectedOrder?.vietnam_proof &&
                  proofFile && (
                    <button
                      type="button"
                      className="vn-upload-button"
                      onClick={
                        uploadProof
                      }
                      disabled={
                        uploadingProof
                      }
                    >
                      <Upload
                        size={16}
                      />

                      {uploadingProof
                        ? "Uploading..."
                        : "Upload Proof"}
                    </button>
                  )}

                {selectedOrder?.vietnam_proof && (
                  <button
                    type="button"
                    className="vn-complete-final-button"
                    onClick={
                      completeOrder
                    }
                    disabled={
                      uploadingProof
                    }
                  >
                    <CheckCircle2
                      size={17}
                    />

                    Complete Order
                  </button>
                )}

              </div>

            </div>
          </div>
        )}

    </div>
  );
}

export default VietnamOrders;