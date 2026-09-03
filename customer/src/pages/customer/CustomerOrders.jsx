import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Home,
  Package,
  Clock3,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronRight,
ChevronLeft,
  RefreshCw,
  Plus,
  MessageCircle,
  ShoppingBag,
  Globe2,
  Wrench,
  Send,
  Upload,
  X,
  ExternalLink,
  FileText,
  CalendarDays,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Paperclip,
  CreditCard,
  UserRound,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./CustomerOrders.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function getToken() {
  return localStorage.getItem("customerToken");
}

async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const raw = await response.text();

  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {
      message: raw || "Server returned invalid JSON.",
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        "Something went wrong."
    );
  }

  return data;
}

function money(value, currency = "USD") {
  const amount = Number(value || 0);

  if (String(currency).toUpperCase() === "KHR") {
    return `${Math.round(amount).toLocaleString()} ៛`;
  }

  return `$${amount.toFixed(2)}`;
}

function dateLabel(value) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateTimeLabel(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function requestTypeLabel(type) {
  if (type === "vietnam") {
    return "Vietnam Purchase";
  }

  if (type === "china") {
    return "China Purchase";
  }

  if (type === "service") {
    return "Service Request";
  }

  return "Customer Request";
}

function requestTypeIcon(type, size = 18) {
  if (type === "vietnam") {
    return <Globe2 size={size} />;
  }

  if (type === "china") {
    return <ShoppingBag size={size} />;
  }

  return <Wrench size={size} />;
}

function requestStatus(request) {
  if (request?.order_id) {
    return {
      text: "Order created",
      tone: "success",
    };
  }

  const quote = String(
    request?.quote_status || "pending"
  ).toLowerCase();

  if (quote === "quoted") {
    return {
      text: "Quote ready",
      tone: "quote",
    };
  }

  if (quote === "accepted") {
    return {
      text: "Accepted",
      tone: "success",
    };
  }

  if (quote === "declined") {
    return {
      text: "Declined",
      tone: "danger",
    };
  }

  return {
    text: "Waiting for quote",
    tone: "waiting",
  };
}

function orderStatus(status) {
  const value = String(
    status || "pending"
  ).toLowerCase();

  if (
    [
      "completed",
      "complete",
      "paid",
    ].includes(value)
  ) {
    return {
      text: "Completed",
      tone: "success",
      icon: <CheckCircle2 size={16} />,
    };
  }

  if (
    [
      "processing",
      "shipping",
      "shipped",
    ].includes(value)
  ) {
    return {
      text:
        value === "processing"
          ? "Processing"
          : "Shipping",
      tone: "processing",
      icon: <Truck size={16} />,
    };
  }

  if (
    [
      "cancelled",
      "canceled",
    ].includes(value)
  ) {
    return {
      text: "Cancelled",
      tone: "danger",
      icon: <XCircle size={16} />,
    };
  }

  if (value === "pending_payment") {
    return {
      text: "Payment required",
      tone: "quote",
      icon: <Clock3 size={16} />,
    };
  }

  return {
    text: "Pending",
    tone: "waiting",
    icon: <Clock3 size={16} />,
  };
}

function resolveServiceName(order) {
  const direct = String(order?.service_name || "").trim();

  if (direct && direct.toLowerCase() !== "unknown service") {
    return direct;
  }

  const itemService = order?.services?.find(
    (item) => item?.service_name
  )?.service_name;

  if (itemService) return itemService;

  const requestService = String(
    order?.request?.service_name || ""
  ).trim();

  if (
    requestService &&
    requestService.toLowerCase() !== "unknown service"
  ) {
    return requestService;
  }

  const type = String(
    order?.request_type || order?.request?.request_type || ""
  ).toLowerCase();

  if (type === "vietnam") return "Vietnam Purchase";
  if (type === "china") return "China Purchase";
  if (type === "service") return "Service Request";

  return "YN Studio Order";
}

function CustomerOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fileInputRef = useRef(null);

  const [mainTab, setMainTab] = useState("orders");

  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [services, setServices] = useState([]);

  const [loadingOrders, setLoadingOrders] =
    useState(true);

  const [loadingRequests, setLoadingRequests] =
    useState(false);

  const [loadingServices, setLoadingServices] =
    useState(false);

  const [pageError, setPageError] = useState("");
  const [requestError, setRequestError] =
    useState("");

  const [toast, setToast] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showRequestForm, setShowRequestForm] =
    useState(false);

  const [requestType, setRequestType] =
    useState("");

  const [selectedService, setSelectedService] =
    useState("");

  const [productLink, setProductLink] =
    useState("");

  const [quantity, setQuantity] = useState(1);

  const [details, setDetails] =
    useState("");

  const [deadline, setDeadline] =
    useState("");

  const [files, setFiles] = useState([]);

  const [submittingRequest, setSubmittingRequest] =
    useState(false);

  const [selectedRequest, setSelectedRequest] =
    useState(null);

  const [loadingRequestDetail, setLoadingRequestDetail] =
    useState(false);

  const [messageText, setMessageText] =
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [acceptingQuote, setAcceptingQuote] =
    useState(false);

  const [decliningQuote, setDecliningQuote] =
    useState(false);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "requests") {
      setMainTab("requests");
    }

    if (!getToken()) {
      navigate("/login", {
        replace: true,
      });

      return;
    }

    loadOrders();
    loadRequests();
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      setToast("");
    }, 3500);

    return () => clearTimeout(timer);
  }, [toast]);

  async function loadOrders() {
    try {
      setLoadingOrders(true);
      setPageError("");

      const data = await apiRequest(
        "/api/customer/orders"
      );

      setOrders(
        Array.isArray(data.orders)
          ? data.orders
          : []
      );
    } catch (error) {
      console.error(
        "CUSTOMER ORDERS ERROR:",
        error
      );

      setPageError(
        error.message ||
          "Unable to load your orders."
      );
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadRequests() {
    try {
      setLoadingRequests(true);
      setRequestError("");

      const data = await apiRequest(
        "/api/customer/requests"
      );

      setRequests(
        Array.isArray(data.requests)
          ? data.requests
          : []
      );
    } catch (error) {
      console.error(
        "CUSTOMER REQUESTS ERROR:",
        error
      );

      setRequestError(
        error.message ||
          "Unable to load your requests."
      );
    } finally {
      setLoadingRequests(false);
    }
  }

  async function loadServices() {
    try {
      setLoadingServices(true);

      const response = await fetch(
        `${API_URL}/services`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Unable to load services."
        );
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.services)
        ? data.services
        : [];

      setServices(
        list.filter(
          (service) =>
            Number(service.active) === 1 ||
            service.active === true
        )
      );
    } catch (error) {
      console.error(
        "SERVICES ERROR:",
        error
      );

      setRequestError(
        error.message ||
          "Unable to load services."
      );
    } finally {
      setLoadingServices(false);
    }
  }

  function resetRequestForm() {
    setRequestType("");
    setSelectedService("");
    setProductLink("");
    setQuantity(1);
    setDetails("");
    setDeadline("");
    setFiles([]);
    setRequestError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openRequestForm() {
    resetRequestForm();
    setShowRequestForm(true);
    loadServices();
  }

  function closeRequestForm() {
    if (!submittingRequest) {
      setShowRequestForm(false);
    }
  }

  function chooseRequestType(type) {
    setRequestType(type);
    setRequestError("");

    if (type === "service") {
      setProductLink("");
      setQuantity(1);
    } else {
      setSelectedService("");
    }
  }

  function handleFileChange(event) {
    const incoming = Array.from(
      event.target.files || []
    );

    const valid = incoming.filter((file) => {
      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
      ];

      return (
        allowed.includes(file.type) &&
        file.size <= 20 * 1024 * 1024
      );
    });

    if (valid.length !== incoming.length) {
      setRequestError(
        "Only JPG, PNG, WEBP, GIF and PDF files under 20 MB are allowed."
      );
    }

    setFiles((current) =>
      [...current, ...valid].slice(0, 10)
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index) {
    setFiles((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  async function submitRequest(event) {
    event.preventDefault();

    setRequestError("");

    if (!requestType) {
      return setRequestError(
        "Choose what you need help with."
      );
    }

    if (
      requestType === "service" &&
      !selectedService
    ) {
      return setRequestError(
        "Choose a service."
      );
    }

    if (
      ["vietnam", "china"].includes(
        requestType
      ) &&
      !productLink.trim()
    ) {
      return setRequestError(
        "Paste the product link."
      );
    }

    if (
      ["vietnam", "china"].includes(
        requestType
      ) &&
      Number(quantity) < 1
    ) {
      return setRequestError(
        "Quantity must be at least 1."
      );
    }

    if (!details.trim()) {
      return setRequestError(
        "Tell us what you need."
      );
    }

    try {
      setSubmittingRequest(true);

      const formData = new FormData();

      formData.append(
        "request_type",
        requestType
      );

      formData.append(
        "details",
        details.trim()
      );

      formData.append(
        "quantity",
        String(
          Math.max(
            1,
            Number(quantity) || 1
          )
        )
      );

      if (requestType === "service") {
        formData.append(
          "service_id",
          selectedService
        );
      }

      if (
        ["vietnam", "china"].includes(
          requestType
        )
      ) {
        formData.append(
          "product_link",
          productLink.trim()
        );
      }

      if (deadline) {
        formData.append(
          "deadline",
          deadline
        );
      }

      files.forEach((file) => {
        formData.append(
          "files",
          file
        );
      });

      const token = getToken();

      const response = await fetch(
        `${API_URL}/api/customer/requests`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            Accept:
              "application/json",
          },
          body: formData,
        }
      );

      const raw =
        await response.text();

      let data = {};

      try {
        data = raw
          ? JSON.parse(raw)
          : {};
      } catch {
        data = {
          message:
            raw ||
            "Server returned invalid JSON.",
        };
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to submit request."
        );
      }

      setToast(
        "Your request has been submitted."
      );

      setShowRequestForm(false);

      resetRequestForm();

      await loadRequests();

      setMainTab("requests");
    } catch (error) {
      console.error(
        "SUBMIT CUSTOMER REQUEST ERROR:",
        error
      );

      setRequestError(
        error.message ||
          "Failed to submit request."
      );
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function openRequest(requestId) {
    try {
      setLoadingRequestDetail(true);
      setSelectedRequest(null);

      const data = await apiRequest(
        `/api/customer/requests/${requestId}`
      );

      setSelectedRequest(
        data.request || null
      );
    } catch (error) {
      console.error(
        "REQUEST DETAIL ERROR:",
        error
      );

      setToast(
        error.message ||
          "Unable to open request."
      );
    } finally {
      setLoadingRequestDetail(false);
    }
  }

  function closeRequestDetail() {
    if (
      !sendingMessage &&
      !acceptingQuote &&
      !decliningQuote
    ) {
      setSelectedRequest(null);
      setMessageText("");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const message =
      messageText.trim();

    if (!message) return;

    if (!selectedRequest?.id) {
      return;
    }

    try {
      setSendingMessage(true);

      const data = await apiRequest(
        `/api/customer/requests/${selectedRequest.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            message,
          }),
        }
      );

      if (data.request) {
        setSelectedRequest(
          data.request
        );
      } else {
        await openRequest(
          selectedRequest.id
        );
      }

      setMessageText("");

      await loadRequests();
    } catch (error) {
      console.error(
        "SEND REQUEST MESSAGE ERROR:",
        error
      );

      setToast(
        error.message ||
          "Unable to send message."
      );
    } finally {
      setSendingMessage(false);
    }
  }

/* =========================================================
   ACCEPT QUOTE
========================================================= */

async function acceptQuote() {
  if (!selectedRequest?.id || acceptingQuote) {
    return;
  }

  const requestId = Number(selectedRequest.id);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    alert("Invalid request ID.");
    return;
  }

  const confirmed = window.confirm(
    "Accept this quotation and create your order?"
  );

  if (!confirmed) {
    return;
  }

  try {
    setAcceptingQuote(true);

    const token = localStorage.getItem(
      "customerToken"
    );

    if (!token) {
      throw new Error(
        "Please log in again."
      );
    }

    console.log(
      "========================================"
    );
    console.log(
      "ACCEPTING QUOTE"
    );
    console.log(
      "REQUEST ID:",
      requestId
    );
    console.log(
      "========================================"
    );

    const response = await fetch(
      `${API_URL}/api/customer/requests/${requestId}/accept`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${token}`,
          Accept:
            "application/json",
        },
      }
    );

    const data =
      await response.json();

    console.log(
      "ACCEPT QUOTE SERVER RESPONSE:",
      data
    );

    if (!response.ok) {
      throw new Error(
        data.message ||
          data.error ||
          "Unable to accept quotation."
      );
    }

    if (data.success !== true) {
      throw new Error(
        data.message ||
          "Quotation was not accepted."
      );
    }

    /*
     * IMPORTANT:
     *
     * Remove the request from the customer
     * request list immediately.
     *
     * This guarantees that Quote Ready disappears
     * from the list even before the refresh finishes.
     */

    setRequests((current) =>
      current.filter(
        (request) =>
          Number(request.id) !==
          requestId
      )
    );

    /*
     * Close the quotation/chat window.
     *
     * This is important because the quote card
     * is rendered from selectedRequest.
     */

    setSelectedRequest(null);
    setMessageText("");

    /*
     * Reload requests from the database.
     */

    await loadRequests();

    /*
     * Reload customer orders from the database.
     */

    await loadOrders();

    /*
     * Go directly to Orders.
     */

    setMainTab("orders");

    setToast(
      data.order?.public_order_number
        ? `Order #${data.order.public_order_number} has been created successfully.`
        : "Your quotation was accepted and your order has been created."
    );

    console.log(
      "========================================"
    );
    console.log(
      "QUOTE ACCEPTED SUCCESSFULLY"
    );
    console.log(
      "CREATED ORDER:",
      data.order
    );
    console.log(
      "========================================"
    );

  } catch (error) {
    console.error(
      "ACCEPT QUOTE ERROR:",
      error
    );

    alert(
      error.message ||
        "Unable to accept quotation."
    );

  } finally {
    setAcceptingQuote(false);
  }
}

//decline quote
  async function declineQuote() {
    if (!selectedRequest?.id) {
      return;
    }

    const confirmed =
      window.confirm(
        "Are you sure you want to decline this quotation?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setDecliningQuote(true);

      const data = await apiRequest(
        `/api/customer/requests/${selectedRequest.id}/decline`,
        {
          method: "POST",
        }
      );

      setToast(
        data.message ||
          "Quotation declined."
      );

      if (data.request) {
        setSelectedRequest(
          data.request
        );
      } else {
        await openRequest(
          selectedRequest.id
        );
      }

      await loadRequests();
    } catch (error) {
      console.error(
        "DECLINE QUOTE ERROR:",
        error
      );

      setToast(
        error.message ||
          "Unable to decline quotation."
      );
    } finally {
      setDecliningQuote(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !query ||
        String(
          order.public_order_number ||
            order.id ||
            ""
        )
          .toLowerCase()
          .includes(query) ||
        String(
          order.service_name || ""
        )
          .toLowerCase()
          .includes(query);

      const status = String(
        order.status || "pending"
      ).toLowerCase();

      const matchesFilter =
        filter === "all" ||
        (filter === "pending" &&
          [
            "pending",
            "pending_payment",
          ].includes(status)) ||
        (filter === "processing" &&
          [
            "processing",
            "shipping",
            "shipped",
          ].includes(status)) ||
        (filter === "completed" &&
          [
            "completed",
            "complete",
            "paid",
          ].includes(status));

      return (
        matchesSearch &&
        matchesFilter
      );
    });
  }, [
    orders,
    search,
    filter,
  ]);

  const filteredRequests = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return requests.filter((request) => {
      if (!query) return true;

      return (
        String(
          request.id || ""
        )
          .toLowerCase()
          .includes(query) ||
        String(
          request.request_type || ""
        )
          .toLowerCase()
          .includes(query) ||
        String(
          request.service_name || ""
        )
          .toLowerCase()
          .includes(query) ||
        String(
          request.details || ""
        )
          .toLowerCase()
          .includes(query)
      );
    });
  }, [
    requests,
    search,
  ]);

  const requestStats = useMemo(() => {
    return {
      total: requests.length,

      waiting: requests.filter(
        (request) =>
          !request.order_id &&
          String(
            request.quote_status ||
              "pending"
          ).toLowerCase() ===
            "pending"
      ).length,

      quoted: requests.filter(
        (request) =>
          String(
            request.quote_status || ""
          ).toLowerCase() ===
          "quoted"
      ).length,

      converted: requests.filter(
        (request) =>
          Boolean(request.order_id)
      ).length,
    };
  }, [requests]);

  return (
  <div className="customer-orders-page">

    {/* BACK BUTTON */}
    <button
      type="button"
      className="customer-orders-back-button"
      onClick={() => navigate(-1)}
    >
      <ChevronLeft size={17} />
      <span>Back</span>
    </button>

    <section className="customer-orders-hero">
        <div>
          <div className="hero-kicker">
            YN STUDIO
          </div>

          <h1>
            Orders & Requests
          </h1>

          <p>
            Track your orders and send
            new requests directly to
            YN Studio.
          </p>
        </div>

        <button
          type="button"
          className="request-primary-button"
          onClick={openRequestForm}
        >
          <Plus size={18} />
          New Request
        </button>
      </section>

      <div className="orders-tabs">
        <button
          type="button"
          className={
            mainTab === "orders"
              ? "active"
              : ""
          }
          onClick={() => {
            setMainTab("orders");
            setSearch("");
          }}
        >
          <Package size={16} />
          Orders
          <span>
            {orders.length}
          </span>
        </button>

        <button
          type="button"
          className={
            mainTab === "requests"
              ? "active"
              : ""
          }
          onClick={() => {
            setMainTab("requests");
            setSearch("");
          }}
        >
          <MessageCircle size={16} />
          Requests
          <span>
            {requests.length}
          </span>
        </button>
      </div>

      {pageError && (
        <div className="customer-orders-alert error">
          <AlertCircle size={16} />
          <span>
            {pageError}
          </span>

          <button
            type="button"
            onClick={() => {
              setPageError("");
              loadOrders();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {mainTab === "orders" ? (
        <>
          <div className="orders-toolbar">
            <div className="orders-search">
              <Search size={16} />

              <input
                type="text"
                placeholder="Search your orders..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All orders
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="processing">
                Processing
              </option>

              <option value="completed">
                Completed
              </option>
            </select>

            <button
              type="button"
              className="icon-refresh"
              onClick={loadOrders}
              disabled={loadingOrders}
              title="Refresh orders"
            >
              <RefreshCw
                size={16}
                className={
                  loadingOrders
                    ? "spin"
                    : ""
                }
              />
            </button>
          </div>

          {loadingOrders ? (
            <div className="empty-state">
              <div className="loading-ring" />
              <h3>
                Loading your orders
              </h3>
              <p>
                Getting your latest
                order information...
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Package size={25} />
              </div>

              <h3>
                {search
                  ? "No orders found"
                  : "No orders yet"}
              </h3>

              <p>
                {search
                  ? "Try a different search."
                  : "Once you place an order, it will appear here."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={openRequestForm}
                >
                  Create a request
                </button>
              )}
            </div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map(
                (order) => {
                  const status =
                    orderStatus(
                      order.status
                    );

                  return (
                    <button
                      type="button"
                      key={
                        order.id
                      }
                      className="order-card"
                      onClick={() =>
                        navigate(
                          `/customer/orders/${order.id}`
                        )
                      }
                    >
                      <div className="order-card-icon">
                        <Package
                          size={19}
                        />
                      </div>

                      <div className="order-card-main">
                        <div className="order-card-top">
                          <strong>
                            Order #
                            {order.public_order_number ||
                              order.id}
                          </strong>

                          <span
                            className={`status-pill ${status.tone}`}
                          >
                            {status.icon}
                            {status.text}
                          </span>
                        </div>

                        <div className="order-service-name">
                          {resolveServiceName(order)}
                        </div>

                        <div className="order-card-meta">
                          <span>
                            {dateLabel(
                              order.created_at
                            )}
                          </span>

                          {order.payment_status && (
                            <span>
                              Payment:{" "}
                              {String(
                                order.payment_status
                              ).replace(
                                "_",
                                " "
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="order-card-right">
                        <strong>
                          {money(
                            order.total
                          )}
                        </strong>

                        <ChevronRight
                          size={17}
                        />
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="request-summary-row">
            <div>
              <span>
                Total
              </span>
              <strong>
                {requestStats.total}
              </strong>
            </div>

            <div>
              <span>
                Waiting
              </span>
              <strong>
                {requestStats.waiting}
              </strong>
            </div>

            <div>
              <span>
                Quoted
              </span>
              <strong>
                {requestStats.quoted}
              </strong>
            </div>

            <button
              type="button"
              className="icon-refresh"
              onClick={loadRequests}
              disabled={
                loadingRequests
              }
              title="Refresh requests"
            >
              <RefreshCw
                size={16}
                className={
                  loadingRequests
                    ? "spin"
                    : ""
                }
              />
            </button>
          </div>

          <div className="orders-toolbar">
            <div className="orders-search">
              <Search size={16} />

              <input
                type="text"
                placeholder="Search your requests..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="request-toolbar-button"
              onClick={openRequestForm}
            >
              <Plus size={16} />
              Request
            </button>
          </div>

          {requestError && (
            <div className="customer-orders-alert error">
              <AlertCircle
                size={16}
              />

              <span>
                {requestError}
              </span>

              <button
                type="button"
                onClick={() =>
                  setRequestError("")
                }
              >
                Dismiss
              </button>
            </div>
          )}

          {loadingRequests ? (
            <div className="empty-state">
              <div className="loading-ring" />

              <h3>
                Loading requests
              </h3>

              <p>
                Getting your latest
                requests...
              </p>
            </div>
          ) : filteredRequests.length ===
            0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <MessageCircle
                  size={25}
                />
              </div>

              <h3>
                {search
                  ? "No requests found"
                  : "No requests yet"}
              </h3>

              <p>
                {search
                  ? "Try a different search."
                  : "Need something from Vietnam, China, or one of our services?"}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={
                    openRequestForm
                  }
                >
                  Make your first request
                </button>
              )}
            </div>
          ) : (
            <div className="requests-list">
              {filteredRequests.map(
                (request) => {
                  const status =
                    requestStatus(
                      request
                    );

                  return (
                    <button
                      type="button"
                      key={
                        request.id
                      }
                      className="request-card"
                      onClick={() =>
                        openRequest(
                          request.id
                        )
                      }
                    >
                      <div
                        className={`request-type-icon ${request.request_type}`}
                      >
                        {requestTypeIcon(
                          request.request_type
                        )}
                      </div>

                      <div className="request-card-main">
                        <div className="request-card-top">
                          <strong>
                            {requestTypeLabel(
                              request.request_type
                            )}
                          </strong>

                          <span
                            className={`status-pill ${status.tone}`}
                          >
                            {status.text}
                          </span>
                        </div>

                        <p>
                          {request.service_name ||
                            (request.request_type === "vietnam"
                              ? "Vietnam Purchase"
                              : request.request_type === "china"
                              ? "China Purchase"
                              : "Service Request")} 
                          {request.details ||
                            "Customer request"}
                        </p>

                        <div className="request-card-meta">
                          <span>
                            Request #
                            {request.id}
                          </span>

                          <span>
                            {dateLabel(
                              request.created_at
                            )}
                          </span>

                          {request.quote_amount !=
                            null && (
                            <span>
                              Quote:{" "}
                              {money(
                                request.quote_amount,
                                request.quote_currency
                              )}
                            </span>
                          )}
                        </div>

                        {request.last_message && (
                          <div className="request-last-message">
                            <MessageCircle
                              size={12}
                            />

                            <span>
                              {
                                request.last_message
                              }
                            </span>
                          </div>
                        )}
                      </div>

                      <ChevronRight
                        size={18}
                        className="request-card-arrow"
                      />
                    </button>
                  );
                }
              )}
            </div>
          )}
        </>
      )}

      {showRequestForm && (
        <div
          className="request-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeRequestForm();
            }
          }}
        >
          <div className="request-modal">
            <div className="request-modal-header">
              <div>
                <div className="modal-kicker">
                  NEW REQUEST
                </div>

                <h2>
                  What can we help you with?
                </h2>

                <p>
                  Send us the details and
                  we'll review your request.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeRequestForm
                }
                disabled={
                  submittingRequest
                }
              >
                <X size={18} />
              </button>
            </div>

            <div className="request-type-grid">
              {[
                {
                  value: "vietnam",
                  title:
                    "Vietnam",
                  description:
                    "Request a product from Vietnam.",
                },
                {
                  value: "china",
                  title:
                    "China",
                  description:
                    "Request a product from China.",
                },
                {
                  value: "service",
                  title:
                    "Service",
                  description:
                    "Request one of our services.",
                },
              ].map(
                (type) => (
                  <button
                    type="button"
                    key={
                      type.value
                    }
                    className={`request-type-card ${
                      requestType ===
                      type.value
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      chooseRequestType(
                        type.value
                      )
                    }
                  >
                    <span>
                      {requestTypeIcon(
                        type.value,
                        18
                      )}
                    </span>

                    <strong>
                      {type.title}
                    </strong>

                    <small>
                      {
                        type.description
                      }
                    </small>

                    {requestType ===
                      type.value && (
                      <Check
                        size={16}
                      />
                    )}
                  </button>
                )
              )}
            </div>

            <form
              className="request-form-body"
              onSubmit={
                submitRequest
              }
            >
              {requestType ===
                "service" && (
                <label className="request-field">
                  <span>
                    Service
                  </span>

                  <select
                    value={
                      selectedService
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedService(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      loadingServices
                    }
                  >
                    <option value="">
                      {loadingServices
                        ? "Loading services..."
                        : "Select a service"}
                    </option>

                    {services.map(
                      (service) => (
                        <option
                          key={
                            service.id
                          }
                          value={
                            service.id
                          }
                        >
                          {
                            service.name
                          }
                          {service.price
                            ? ` — ${money(
                                service.price
                              )}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}

              {[
                "vietnam",
                "china",
              ].includes(
                requestType
              ) && (
                <>
                  <label className="request-field">
                    <span>
                      Product link
                    </span>

                    <div className="field-with-icon">
                      <LinkIcon
                        size={15}
                      />

                      <input
                        type="url"
                        value={
                          productLink
                        }
                        onChange={(
                          event
                        ) =>
                          setProductLink(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </label>

                  <div className="request-two-fields">
                    <label className="request-field">
                      <span>
                        Quantity
                      </span>

                      <input
                        type="number"
                        min="1"
                        value={
                          quantity
                        }
                        onChange={(
                          event
                        ) =>
                          setQuantity(
                            event
                              .target
                              .value
                          )
                        }
                      />
                    </label>

                    <label className="request-field">
                      <span>
                        Deadline{" "}
                        <em>
                          optional
                        </em>
                      </span>

                      <div className="field-with-icon">
                        <CalendarDays
                          size={15}
                        />

                        <input
                          type="date"
                          value={
                            deadline
                          }
                          onChange={(
                            event
                          ) =>
                            setDeadline(
                              event
                                .target
                                .value
                            )
                          }
                        />
                      </div>
                    </label>
                  </div>
                </>
              )}

              {requestType ===
                "service" && (
                <label className="request-field">
                  <span>
                    Deadline{" "}
                    <em>
                      optional
                    </em>
                  </span>

                  <div className="field-with-icon">
                    <CalendarDays
                      size={15}
                    />

                    <input
                      type="date"
                      value={
                        deadline
                      }
                      onChange={(
                        event
                      ) =>
                        setDeadline(
                          event.target
                            .value
                        )
                      }
                    />
                  </div>
                </label>
              )}

              <label className="request-field">
                <span>
                  Tell us what you need
                </span>

                <textarea
                  rows="5"
                  value={
                    details
                  }
                  onChange={(
                    event
                  ) =>
                    setDetails(
                      event.target
                        .value
                    )
                  }
                  placeholder="Describe the product, service, color, size, quantity, special instructions, or anything else we should know..."
                />
              </label>

              <div className="request-field">
                <span>
                  Attach files{" "}
                  <em>
                    optional
                  </em>
                </span>

                <label className="upload-zone">
                  <Upload size={19} />

                  <div>
                    <strong>
                      Add photos or documents
                    </strong>

                    <small>
                      JPG, PNG, WEBP, GIF or
                      PDF · max 20 MB each
                    </small>
                  </div>

                  <input
                    ref={
                      fileInputRef
                    }
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
                    onChange={
                      handleFileChange
                    }
                  />
                </label>

                {files.length > 0 && (
                  <div className="file-list">
                    {files.map(
                      (
                        file,
                        index
                      ) => (
                        <div
                          className="file-chip"
                          key={`${file.name}-${index}`}
                        >
                          <Paperclip
                            size={13}
                          />

                          <span>
                            {
                              file.name
                            }
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              removeFile(
                                index
                              )
                            }
                          >
                            <X
                              size={13}
                            />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {requestError && (
                <div className="form-error">
                  <AlertCircle
                    size={15}
                  />

                  <span>
                    {requestError}
                  </span>
                </div>
              )}

              <div className="request-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeRequestForm
                  }
                  disabled={
                    submittingRequest
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="request-submit-button"
                  disabled={
                    submittingRequest
                  }
                >
                  {submittingRequest ? (
                    <>
                      <RefreshCw
                        size={16}
                        className="spin"
                      />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send
                        size={16}
                      />
                      Send Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRequest && (
        <div
          className="request-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeRequestDetail();
            }
          }}
        >
          <div className="request-chat-modal">
            <div className="chat-header">
              <div className="request-type-icon small">
                {requestTypeIcon(
                  selectedRequest.request_type,
                  17
                )}
              </div>

              <div className="chat-title">
                <span>
                  {
                    requestTypeLabel(
                      selectedRequest.request_type
                    )
                  }
                </span>

                <h2>
                  Request #
                  {
                    selectedRequest.id
                  }
                </h2>

                <small>
                  {dateTimeLabel(
                    selectedRequest.created_at
                  )}
                </small>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeRequestDetail
                }
              >
                <X size={18} />
              </button>
            </div>

            {loadingRequestDetail ? (
              <div className="chat-loading">
                Loading request...
              </div>
            ) : (
              <>
                <div className="chat-content">
                  <div className="request-info-card">
                    <div className="info-row">
                      <span>
                        Status
                      </span>

                      <strong
                        className={`status-pill ${
                          requestStatus(
                            selectedRequest
                          ).tone
                        }`}
                      >
                        {
                          requestStatus(
                            selectedRequest
                          ).text
                        }
                      </strong>
                    </div>

                    {selectedRequest.service_name && (
                      <div className="info-row">
                        <span>
                          Service
                        </span>

                        <strong>
                          {
                            selectedRequest.service_name
                          }
                        </strong>
                      </div>
                    )}

                    {selectedRequest.product_link && (
                      <div className="info-row">
                        <span>
                          Product
                        </span>

                        <a
                          href={
                            selectedRequest.product_link
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open link
                          <ExternalLink
                            size={12}
                          />
                        </a>
                      </div>
                    )}

                    <div className="info-row">
                      <span>
                        Quantity
                      </span>

                      <strong>
                        {
                          selectedRequest.quantity
                        }
                      </strong>
                    </div>

                    {selectedRequest.deadline && (
                      <div className="info-row">
                        <span>
                          Deadline
                        </span>

                        <strong>
                          {dateLabel(
                            selectedRequest.deadline
                          )}
                        </strong>
                      </div>
                    )}

                    {selectedRequest.details && (
                      <div className="info-details">
                        <span>
                          Request details
                        </span>

                        <p>
                          {
                            selectedRequest.details
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedRequest.quote_amount !=
                    null &&
                    selectedRequest.quote_status ===
                      "quoted" && (
                      <div className="quote-card">
                        <div className="quote-card-top">
                          <div>
                            <span>
                              QUOTATION
                            </span>

                            <strong>
                              {money(
                                selectedRequest.quote_amount,
                                selectedRequest.quote_currency
                              )}
                            </strong>
                          </div>

                          <div className="quote-icon">
                            <FileText
                              size={19}
                            />
                          </div>
                        </div>

                        {selectedRequest.quote_note && (
                          <p>
                            {
                              selectedRequest.quote_note
                            }
                          </p>
                        )}

                        <div className="quote-actions">
                          <button
                            type="button"
                            className="decline-button"
                            onClick={
                              declineQuote
                            }
                            disabled={
                              decliningQuote ||
                              acceptingQuote
                            }
                          >
                            {decliningQuote
                              ? "Declining..."
                              : "Decline"}
                          </button>

                          <button
                            type="button"
                            className="accept-button"
                            onClick={
                              acceptQuote
                            }
                            disabled={
                              acceptingQuote ||
                              decliningQuote
                            }
                          >
                            {acceptingQuote
                              ? "Accepting..."
                              : "Accept quotation"}
                          </button>
                        </div>
                      </div>
                    )}

                  {selectedRequest.order_id && (
                    <div className="linked-order-card">
                      <div>
                        <span>
                          ORDER CREATED
                        </span>

                        <strong>
                          Order #
                          {
                            selectedRequest.order_id
                          }
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/customer/orders/${selectedRequest.order_id}`
                          )
                        }
                      >
                        View order
                        <ChevronRight
                          size={14}
                        />
                      </button>
                    </div>
                  )}

                  <div className="conversation-title">
                    <MessageCircle
                      size={14}
                    />
                    Conversation
                  </div>

                  <div className="messages-list">
                    {Array.isArray(
                      selectedRequest.messages
                    ) &&
                    selectedRequest.messages
                      .length > 0 ? (
                      selectedRequest.messages.map(
                        (message) => {
                          const mine =
                            message.sender_type ===
                            "customer";

                          const system =
                            message.sender_type ===
                            "system";

                          return (
                            <div
                              key={
                                message.id
                              }
                              className={`message-row ${
                                mine
                                  ? "mine"
                                  : system
                                  ? "system"
                                  : ""
                              }`}
                            >
                              <div className="message-bubble">
                                {
                                  message.message
                                }

                                <small>
                                  {dateTimeLabel(
                                    message.created_at
                                  )}
                                </small>
                              </div>
                            </div>
                          );
                        }
                      )
                    ) : (
                      <div className="no-messages">
                        No messages yet.
                        Send a message below
                        if you'd like to add
                        more information.
                      </div>
                    )}
                  </div>
                </div>

                <form
                  className="chat-composer"
                  onSubmit={
                    sendMessage
                  }
                >
                  <input
                    type="text"
                    value={
                      messageText
                    }
                    onChange={(
                      event
                    ) =>
                      setMessageText(
                        event.target
                          .value
                      )
                    }
                    placeholder="Write a message..."
                    disabled={
                      sendingMessage
                    }
                  />

                  <button
                    type="submit"
                    disabled={
                      sendingMessage ||
                      !messageText.trim()
                    }
                  >
                    {sendingMessage ? (
                      <RefreshCw
                        size={17}
                        className="spin"
                      />
                    ) : (
                      <Send
                        size={17}
                      />
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="customer-toast">
          <CheckCircle2 size={16} />
          <span>
            {toast}
          </span>
        </div>
      )}
      {/* =========================================================
    CUSTOMER BOTTOM NAVIGATION
========================================================= */}

<nav className="customer-orders-bottom-nav">

  <button
    type="button"
    className="customer-orders-nav-item"
    onClick={() => navigate("/customer/home")}
  >
    <Home size={19} />
    <span>Home</span>
  </button>

  <button
    type="button"
    className="customer-orders-nav-item active"
    onClick={() => navigate("/customer/orders")}
  >
    <Package size={19} />
    <span>Orders</span>
  </button>

  <button
    type="button"
    className="customer-orders-nav-item"
    onClick={() => navigate("/customer/loan")}
  >
    <CreditCard size={19} />
    <span>Loan</span>
  </button>

  <button
    type="button"
    className="customer-orders-nav-item"
    onClick={() => navigate("/customer/profile")}
  >
    <UserRound size={19} />
    <span>Profile</span>
  </button>

</nav>
    </div>
  );
}

export default CustomerOrders;