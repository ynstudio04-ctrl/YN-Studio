import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
CHINA ORDER WORKFLOW
=========================================================

1. pending_payment
2. ordered
3. arrive_china_warehouse
4. delivering
5. customs_clearance
6. customs_clearance_done
7. arrive_pp_warehouse
8. delivering_to_customer
9. completed

Payment approval happens from Payments.jsx.

The order cannot be completed until
a delivery proof picture has been uploaded.
=========================================================
*/

const CHINA_STATUSES = [
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
    value: "arrive_china_warehouse",
    label: "Arrive in China Warehouse",
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

function ChinaOrders() {
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

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

  const fileInputRef =
    useRef(null);

  /*
  =========================================================
  LOAD ORDERS
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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load orders."
        );
      }

      const list =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.orders)
          ? data.orders
          : [];

      /*
      -------------------------------------------------------
      ONLY CHINA ORDERS
      -------------------------------------------------------
      */

      const chinaOrders =
        list.filter((order) => {
          const type =
            String(
              order?.request_type ||
                order?.service_type ||
                ""
            ).toLowerCase();

          return (
            type === "china" ||
            type === "china_purchase"
          );
        });

      setOrders(chinaOrders);
    } catch (err) {
      console.error(
        "LOAD CHINA ORDERS ERROR:",
        err
      );

      setError(
        err.message ||
          "Failed to load China orders."
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
  STATUS
  =========================================================
  */

  function getStatus(order) {
    const status =
      String(
        order?.china_status ||
          order?.status ||
          "pending_payment"
      ).toLowerCase();

    /*
    Existing orders created before
    china_status existed.

    If payment is already paid and
    the old status is processing,
    treat it as ordered.
    */

    if (
      status === "processing" &&
      order?.payment_status ===
        "paid"
    ) {
      return "ordered";
    }

    return status;
  }

  function getStatusLabel(status) {
    const found =
      CHINA_STATUSES.find(
        (item) =>
          item.value === status
      );

    return (
      found?.label ||
      String(status || "")
        .replaceAll("_", " ")
        .replace(
          /\b\w/g,
          (char) =>
            char.toUpperCase()
        ) ||
      "Unknown"
    );
  }

  function getStatusIndex(status) {
    return CHINA_STATUSES.findIndex(
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
            ${getStatusLabel(
              getStatus(order)
            )}
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
          `${API_URL}/orders/${order.id}/china-status`,
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
            "Failed to update China order status."
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
                    china_status:
                      newStatus,
                  }
                : item
          )
      );
    } catch (err) {
      console.error(
        "CHANGE CHINA STATUS ERROR:",
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
  PROOF MODAL
  =========================================================
  */

  function openProofUpload(order) {
    setSelectedOrder(order);
    setProofFile(null);
    setProofPreview("");
    setProofModal(true);
  }

  function closeProofModal() {
    if (
      uploadingProof
    ) {
      return;
    }

    setProofModal(false);
    setProofFile(null);
    setProofPreview("");

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }

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
    if (!selectedOrder) {
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
          `${API_URL}/orders/${selectedOrder.id}/china-proof`,
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

      setOrders(
        (current) =>
          current.map(
            (order) =>
              order.id ===
              selectedOrder.id
                ? {
                    ...order,
                    ...updatedOrder,
                    china_proof:
                      updatedOrder.china_proof,
                  }
                : order
          )
      );

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
        "UPLOAD CHINA PROOF ERROR:",
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
    if (!selectedOrder) {
      return;
    }

    if (
      !selectedOrder.china_proof
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
  STATUS CONTROL
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
      CHINA_STATUSES[
        currentIndex + 1
      ];

    const isCompleted =
      status === "completed";

    return (
      <div className="cn-status-control">

        <select
          value={status}
          onChange={(event) =>
            changeStatus(
              order,
              event.target.value
            )
          }
        >
          {CHINA_STATUSES.map(
            (
              item,
              index
            ) => {
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
          className="cn-status-chevron"
        />

        {!isCompleted &&
          nextStatus && (
            <button
              type="button"
              className="cn-next-button"
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
          !order?.china_proof && (
            <button
              type="button"
              className="cn-proof-button"
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
          order?.china_proof && (
            <button
              type="button"
              className="cn-complete-button"
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
            CHINA_STATUSES.length) *
          100
        : 0;

    return (
      <div className="cn-order-card">

        {/* HEADER */}

        <div className="cn-order-card-header">

          <div className="cn-order-number">

            <div className="cn-order-icon">
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
            className={`cn-status-badge cn-status-${status}`}
          >
            {getStatusLabel(
              status
            )}
          </div>

        </div>

        {/* PROGRESS */}

        <div className="cn-progress">

          <div className="cn-progress-track">

            <div
              className="cn-progress-fill"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

          <div className="cn-progress-label">

            <span>
              Step{" "}
              {statusIndex + 1}{" "}
              of{" "}
              {
                CHINA_STATUSES.length
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

        {/* CUSTOMER INFO */}

        <div className="cn-order-info-grid">

          <div className="cn-info-box">

            <div className="cn-info-icon">
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

          <div className="cn-info-box">

            <div className="cn-info-icon">
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

          <div className="cn-info-box">

            <div className="cn-info-icon">
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

          <div className="cn-info-box">

            <div className="cn-info-icon">
              <MapPin
                size={17}
              />
            </div>

            <div>
              <span>
                ROUTE
              </span>

              <strong>
                China → PP
              </strong>
            </div>

          </div>

        </div>

        {/* DETAILS */}

        {(order?.product_link ||
          order?.details ||
          order?.notes) && (
          <div className="cn-order-details">

            <div className="cn-details-heading">

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
                className="cn-product-link"
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

        <div className="cn-payment-row">

          <div>

            <span>
              PAYMENT
            </span>

            <strong
              className={
                isPaid(order)
                  ? "cn-paid"
                  : "cn-unpaid"
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
              className="cn-view-payment"
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

        {/* STATUS */}

        <div className="cn-status-section">

          <div>

            <span className="cn-section-label">
              ORDER PROGRESS
            </span>

            <p>
              Update the China
              delivery stage.
            </p>

          </div>

          <StatusControl
            order={order}
          />

        </div>

        {/* EXISTING PROOF */}

        {order?.china_proof && (
          <div className="cn-proof-existing">

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
                  order.china_proof,
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

        <div className="cn-order-footer">

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
    <div className="page-content cn-orders-page">

      {/* HEADER */}

      <div className="cn-page-header">

        <div>

          <p className="eyebrow">
            CHINA LOGISTICS
          </p>

          <h1>
            China Orders
          </h1>

          <p>
            Manage China purchases
            from quotation approval
            through delivery to the
            customer.
          </p>

        </div>

        <button
          type="button"
          className="cn-refresh-button"
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
                ? "cn-spin"
                : ""
            }
          />

          Refresh
        </button>

      </div>

      {/* ERROR */}

      {error && (
        <div className="cn-error">
          {error}
        </div>
      )}

      {/* SUMMARY */}

      <div className="cn-summary-grid">

        <div className="cn-summary-card">
          <div className="cn-summary-icon">
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

        <div className="cn-summary-card">
          <div className="cn-summary-icon">
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

        <div className="cn-summary-card">
          <div className="cn-summary-icon">
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

        <div className="cn-summary-card">
          <div className="cn-summary-icon">
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

      <div className="cn-mini-summary">

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
            China → PP
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

      {/* ORDERS */}

      <div className="cn-orders-container">

        <div className="cn-orders-heading">

          <div>

            <h2>
              China Order List
            </h2>

            <p>
              Orders created from
              China customer
              requests.
            </p>

          </div>

          <div className="cn-search">

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
          <div className="cn-empty">

            <RefreshCw
              size={27}
              className="cn-spin"
            />

            <h3>
              Loading China
              orders...
            </h3>

          </div>
        ) : filteredOrders.length ===
          0 ? (
          <div className="cn-empty">

            <div className="cn-empty-icon">
              CN
            </div>

            <h3>
              No China Orders
            </h3>

            <p>
              When a customer creates
              a China request and
              accepts your quotation,
              the resulting order will
              appear here.
            </p>

            <button
              type="button"
              className="cn-refresh-button"
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
          <div className="cn-order-list">

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
            className="cn-modal-overlay"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeProofModal();
              }
            }}
          >

            <div className="cn-proof-modal">

              <button
                type="button"
                className="cn-modal-close"
                onClick={
                  closeProofModal
                }
              >
                <X
                  size={20}
                />
              </button>

              <div className="cn-modal-icon">
                <ImageIcon
                  size={25}
                />
              </div>

              <p className="eyebrow">
                DELIVERY PROOF
              </p>

              <h2>
                Complete China
                Order
              </h2>

              <p className="cn-modal-description">
                Upload a picture proving
                that the order has been
                delivered to the customer.
                The order cannot be
                completed without this
                proof.
              </p>

              <div className="cn-modal-order">

                <strong>
                  Order #
                  {getOrderNumber(
                    selectedOrder
                  )}
                </strong>

                <span>
                  {getCustomerName(
                    selectedOrder
                  )}
                </span>

              </div>

              {/* PREVIEW */}

              {proofPreview ? (
                <div className="cn-proof-preview">

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
              ) : selectedOrder?.china_proof ? (
                <div className="cn-existing-proof">

                  <img
                    src={
                      selectedOrder.china_proof
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
                          selectedOrder.china_proof,
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
                  className="cn-upload-area"
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

              <div className="cn-modal-actions">

                <button
                  type="button"
                  className="cn-cancel-button"
                  onClick={
                    closeProofModal
                  }
                  disabled={
                    uploadingProof
                  }
                >
                  Cancel
                </button>

                {!selectedOrder?.china_proof &&
                  proofFile && (
                    <button
                      type="button"
                      className="cn-upload-button"
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

                {selectedOrder?.china_proof && (
                  <button
                    type="button"
                    className="cn-complete-final-button"
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

export default ChinaOrders;