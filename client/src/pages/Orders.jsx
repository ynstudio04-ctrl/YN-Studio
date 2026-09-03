import { useEffect, useMemo, useState } from "react";

import {
  Plus,
  ShoppingBag,
  Search,
  Clock,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
  Save,
  Ban,
  Upload,
  CalendarDays,
  RefreshCw,
  MessageCircle,
  Send,
  ExternalLink,
  Box,
  Wrench,
  Plane,
  ChevronRight,
  DollarSign,
  User,
} from "lucide-react";

import "./Orders.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* =========================================================
   HELPERS
========================================================= */

function formatUSD(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatKHR(value) {
  return `${Math.round(Number(value || 0)).toLocaleString()} ៛`;
}

function formatPrice(value, currency = "USD") {
  return String(currency).toUpperCase() === "KHR"
    ? formatKHR(value)
    : formatUSD(value);
}

function formatDate(date) {
  if (!date) return "—";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date) {
  if (!date) return "—";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function getServiceName(item, services) {
  if (!item) {
    return "Unknown Service";
  }

  // 1. Backend already provided the name
  if (
    item.service_name &&
    String(item.service_name).trim()
  ) {
    return String(item.service_name).trim();
  }

  // 2. Look up the service by service_id
  const serviceId =
    item.service_id ??
    item.serviceId ??
    item.service?.id;

  if (
    serviceId !== null &&
    serviceId !== undefined &&
    String(serviceId).trim() !== ""
  ) {
    const service = services.find(
      (serviceItem) =>
        Number(serviceItem.id) ===
        Number(serviceId)
    );

    if (service?.name) {
      return service.name;
    }
  }

  // 3. Some responses may put the service object directly
  if (item.service?.name) {
    return item.service.name;
  }

  // 4. Last possible name fields
  if (item.name) {
    return item.name;
  }

  return "Unknown Service";
}
function requestTypeLabel(type) {
  const value = String(type || "").toLowerCase();

  if (value === "china") return "China Purchase";
  if (value === "vietnam") return "Vietnam Purchase";
  if (value === "service") return "Service Request";

  return "Customer Request";
}

function requestTypeIcon(type) {
  const value = String(type || "").toLowerCase();

  if (value === "china") {
    return <Box size={17} />;
  }

  if (value === "vietnam") {
    return <Plane size={17} />;
  }

  if (value === "service") {
    return <Wrench size={17} />;
  }

  return <MessageCircle size={17} />;
}

function requestStatusLabel(request) {
  if (request?.order_id) {
    return "Order Created";
  }

  const quoteStatus = String(
    request?.quote_status || "pending"
  ).toLowerCase();

  if (quoteStatus === "quoted") {
    return "Waiting for Customer";
  }

  if (quoteStatus === "accepted") {
    return "Accepted";
  }

  if (quoteStatus === "declined") {
    return "Quote Declined";
  }

  return "Waiting for Quote";
}

function requestStatusClass(request) {
  if (request?.order_id) {
    return "accepted";
  }

  const quoteStatus = String(
    request?.quote_status || "pending"
  ).toLowerCase();

  if (quoteStatus === "quoted") {
    return "quoted";
  }

  if (quoteStatus === "accepted") {
    return "accepted";
  }

  if (quoteStatus === "declined") {
    return "declined";
  }

  return "waiting";
}

/* =========================================================
   COMPONENT
========================================================= */

function Orders() {
  /* =======================================================
     ORDERS
  ======================================================= */

  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  /* =======================================================
     TABS
  ======================================================= */

  const [activeTab, setActiveTab] = useState("orders");

  /* =======================================================
     CUSTOMER REQUESTS
  ======================================================= */

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestDetailsLoading, setRequestDetailsLoading] =
    useState(false);

  const [requestMessage, setRequestMessage] = useState("");
  const [sendingRequestMessage, setSendingRequestMessage] =
    useState(false);

  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [quoteNote, setQuoteNote] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);

  /* =======================================================
     ORDER MODAL
  ======================================================= */

  const [open, setOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customer_id: "",
    order_type: "service",
    order_date: "",
    custom_price: "",
    product_image: null,
    status: "pending",
    notes: "",
    services: [],
  });

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    loadOrders();
    loadCustomers();
    loadServices();
    loadRequests();
  }, []);

  /* =======================================================
     CUSTOMERS
  ======================================================= */

  async function loadCustomers() {
    try {
      const response = await fetch(`${API_URL}/customers`);

      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to load customers."
        );
      }

      const customerList = Array.isArray(data)
        ? data
        : Array.isArray(data?.customers)
        ? data.customers
        : [];

      setCustomers(customerList);
    } catch (error) {
      console.error("LOAD CUSTOMERS ERROR:", error);
      setCustomers([]);
    }
  }

  /* =======================================================
     SERVICES
  ======================================================= */

  async function loadServices() {
    try {
      const response = await fetch(`${API_URL}/services`);

      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to load services."
        );
      }

      const serviceList = Array.isArray(data)
        ? data
        : Array.isArray(data?.services)
        ? data.services
        : [];

      setServices(serviceList);
    } catch (error) {
      console.error("LOAD SERVICES ERROR:", error);
      setServices([]);
    }
  }

  /* =======================================================
     ORDERS
  ======================================================= */

  async function loadOrders() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/orders`);

      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to load orders."
        );
      }

      const orderList = Array.isArray(data)
        ? data
        : Array.isArray(data?.orders)
        ? data.orders
        : [];

      setOrders(orderList);
    } catch (error) {
      console.error("LOAD ORDERS ERROR:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     CUSTOMER REQUESTS
  ======================================================= */

async function loadRequests() {
  try {
    setRequestsLoading(true);

    const response = await fetch(
      `${API_URL}/admin/customer-requests`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const rawText = await response.text();

    let data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      console.error(
        "CUSTOMER REQUEST JSON PARSE ERROR:",
        parseError
      );

      console.error(
        "SERVER RESPONSE:",
        rawText
      );

      throw new Error(
        "Server returned invalid JSON."
      );
    }

    console.log(
      "ADMIN CUSTOMER REQUEST RESPONSE:",
      data
    );

    if (!response.ok) {
      throw new Error(
        data.message ||
          data.error ||
          "Failed to load customer requests."
      );
    }

    /*
      Support all of these backend response formats:

      {
        requests: [...]
      }

      {
        data: [...]
      }

      [...]

      This prevents the Orders page from
      incorrectly showing zero requests.
    */

    let requestList = [];

    if (Array.isArray(data)) {
      requestList = data;
    } else if (Array.isArray(data.requests)) {
      requestList = data.requests;
    } else if (Array.isArray(data.data)) {
      requestList = data.data;
    }

    console.log(
      "ADMIN CUSTOMER REQUESTS LOADED:",
      requestList.length,
      requestList
    );

    setRequests(requestList);
  } catch (error) {
    console.error(
      "LOAD CUSTOMER REQUESTS ERROR:",
      error
    );

    setRequests([]);

    alert(
      error.message ||
        "Failed to load customer requests."
    );
  } finally {
    setRequestsLoading(false);
  }
}
  /* =======================================================
     OPEN REQUEST
  ======================================================= */

  async function openRequest(request) {
  if (!request?.id) {
    console.error(
      "OPEN REQUEST ERROR: Missing request ID",
      request
    );
    return;
  }

  try {
    setSelectedRequest(request);
    setRequestDetailsLoading(true);

    const response = await fetch(
      `${API_URL}/admin/customer-requests/${request.id}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          "Failed to load request."
      );
    }

    const detailedRequest =
      data?.request ||
      data?.data;

    if (!detailedRequest) {
      throw new Error(
        "The server did not return the request details."
      );
    }

    /*
     * IMPORTANT:
     * Always use the detailed request returned
     * from the detail endpoint.
     *
     * This contains:
     * - request information
     * - quote information
     * - ALL messages
     * - files
     */
    setSelectedRequest({
      ...detailedRequest,

      messages: Array.isArray(
        detailedRequest.messages
      )
        ? detailedRequest.messages
        : [],

      files: Array.isArray(
        detailedRequest.files
      )
        ? detailedRequest.files
        : [],
    });

    setRequestMessage("");

    setQuoteAmount(
      detailedRequest.quote_amount !== null &&
        detailedRequest.quote_amount !== undefined
        ? String(
            detailedRequest.quote_amount
          )
        : ""
    );

    setQuoteCurrency(
      detailedRequest.quote_currency ===
        "KHR"
        ? "KHR"
        : "USD"
    );

    setQuoteNote(
      detailedRequest.quote_note ||
        ""
    );
  } catch (error) {
    console.error(
      "OPEN REQUEST ERROR:",
      error
    );

    alert(
      error.message ||
        "Failed to load customer request."
    );
  } finally {
    setRequestDetailsLoading(false);
  }
}
  /* =======================================================
     CLOSE REQUEST
  ======================================================= */

  function closeRequest() {
    if (
      sendingRequestMessage ||
      savingQuote
    ) {
      return;
    }

    setSelectedRequest(null);
    setRequestMessage("");
    setQuoteAmount("");
    setQuoteCurrency("USD");
    setQuoteNote("");
  }

  /* =======================================================
     REFRESH REQUESTS
  ======================================================= */

  async function refreshRequests() {
  try {
    const response = await fetch(
      `${API_URL}/admin/customer-requests`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          "Failed to refresh customer requests."
      );
    }

    const updatedRequests =
      Array.isArray(data)
        ? data
        : Array.isArray(data.requests)
        ? data.requests
        : Array.isArray(data.data)
        ? data.data
        : [];

    setRequests(updatedRequests);

    /*
     * If a request is currently open,
     * reload the FULL conversation.
     *
     * This is important because the customer
     * may have accepted the quote while the
     * admin modal was already open.
     */
    if (selectedRequest?.id) {
      await openRequest({
        id: selectedRequest.id,
      });
    }

    return updatedRequests;
  } catch (error) {
    console.error(
      "REFRESH CUSTOMER REQUESTS ERROR:",
      error
    );

    return [];
  }
}

  /* =======================================================
     SEND ADMIN MESSAGE
  ======================================================= */

 async function sendRequestMessage(event) {
  event.preventDefault();

  if (!selectedRequest?.id) {
    return;
  }

  const message =
    requestMessage.trim();

  if (!message) {
    return;
  }

  try {
    setSendingRequestMessage(true);

    const response = await fetch(
      `${API_URL}/admin/customer-requests/${selectedRequest.id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
        },
        body: JSON.stringify({
          message,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          "Failed to send message."
      );
    }

    setRequestMessage("");

    /*
     * IMPORTANT:
     * Reload the FULL conversation.
     *
     * Do NOT use the request returned by
     * loadRequests() as the selected chat.
     */
    await openRequest(
      selectedRequest
    );

    /*
     * Refresh the request list separately.
     */
    await loadRequests();
  } catch (error) {
    console.error(
      "SEND REQUEST MESSAGE ERROR:",
      error
    );

    alert(
      error.message ||
        "Failed to send message."
    );
  } finally {
    setSendingRequestMessage(false);
  }
}
  /* =======================================================
     SEND QUOTE
  ======================================================= */

  async function sendQuote(event) {
  event.preventDefault();

  if (!selectedRequest?.id) {
    return;
  }

  const requestId =
    selectedRequest.id;

  const amount =
    Number(quoteAmount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    alert(
      "Please enter a valid quotation amount."
    );
    return;
  }

  if (
    quoteCurrency !== "USD" &&
    quoteCurrency !== "KHR"
  ) {
    alert(
      "Invalid quotation currency."
    );
    return;
  }

  try {
    setSavingQuote(true);

    const response = await fetch(
      `${API_URL}/admin/customer-requests/${requestId}/quote`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body: JSON.stringify({
          amount,
          currency:
            quoteCurrency,
          note:
            quoteNote.trim(),
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    console.log(
      "SEND QUOTE RESPONSE:",
      data
    );

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          "Failed to send quotation."
      );
    }

    /*
     * IMPORTANT:
     *
     * Do NOT do:
     *
     * setSelectedRequest(data.request)
     *
     * because that can replace the full
     * conversation with a request-list object.
     */

    /*
     * Refresh the request list.
     */
    await loadRequests();

    /*
     * Refresh the FULL conversation.
     *
     * This retrieves ALL previous messages
     * plus the new quotation/system message.
     */
    await openRequest({
      id: requestId,
    });

    alert(
      "Quotation sent to the customer."
    );
  } catch (error) {
    console.error(
      "SEND QUOTE ERROR:",
      error
    );

    alert(
      error.message ||
        "Failed to send quotation."
    );
  } finally {
    setSavingQuote(false);
  }
}

  /* =======================================================
     REQUEST SEARCH
  ======================================================= */

  const filteredRequests = useMemo(() => {
    const query =
      requestSearch
        .toLowerCase()
        .trim();

    if (!query) {
      return requests;
    }

    return requests.filter(
      (request) => {
        return (
          String(
            request.id || ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.customer_name ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.customer_code ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.service_name ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.product_name ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.product_link ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.details ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            request.request_type ||
              ""
          )
            .toLowerCase()
            .includes(query)
        );
      }
    );
  }, [
    requests,
    requestSearch,
  ]);

  /* =======================================================
     ORDER FORM
  ======================================================= */

  function resetForm() {
    setForm({
      customer_id: "",
      order_type: "service",
      order_date: "",
      custom_price: "",
      product_image: null,
      status: "pending",
      notes: "",
      services: [],
    });

    setEditingOrder(null);
  }
// Automatic 5-second request refresh removed.
// Customer requests are now refreshed only when explicitly requested
// (for example, using the Refresh button or after sending an update).
  function openCreateOrder() {
    resetForm();

    setForm({
      customer_id: "",
      order_type: "service",
      order_date: "",
      custom_price: "",
      product_image: null,
      status: "pending",
      notes: "",
      services: [
        {
          service_id: "",
          quantity: 1,
          approved_date: "",
          notes: "",
          file: null,
        },
      ],
    });

    setOpen(true);
  }

 async function openEditOrder(order) {
  if (!order?.id) {
    alert("Invalid order.");
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/orders/${order.id}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Failed to load order."
      );
    }

    const fullOrder = data?.order || data;

    console.log("EDIT ORDER DATA:", fullOrder);

    const servicesFromOrder = Array.isArray(
      fullOrder.services
    )
      ? fullOrder.services
      : [];

    if (servicesFromOrder.length === 0) {
      throw new Error(
        "This order has no service items."
      );
    }

    const existingServices =
      servicesFromOrder.map((item) => ({
        service_id: String(
          item.service_id ?? ""
        ),

        quantity:
          Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1,

        approved_date:
          item.approved_date
            ? String(item.approved_date).slice(0, 10)
            : "",

        notes:
          item.notes ?? "",

        file: null,

        existing_file_name:
          item.file_name ?? null,

        existing_file_data:
          item.file_data ?? null,

        existing_file_type:
          item.file_type ?? null,

        existing_file_size:
          Number(item.file_size) || 0,
      }));

    setEditingOrder(fullOrder);

    setForm({
      customer_id:
        fullOrder.customer_id != null
          ? String(fullOrder.customer_id)
          : "",

      order_type:
        fullOrder.order_type || "service",

      order_date:
        fullOrder.order_date
          ? String(fullOrder.order_date).slice(0, 10)
          : "",

      custom_price:
        fullOrder.order_type &&
        fullOrder.order_type !== "service"
          ? String(fullOrder.total ?? "")
          : "",

      product_image: null,

      status:
        fullOrder.status || "pending",

      notes:
        fullOrder.notes ?? "",

      services: existingServices,
    });

    setOpen(true);
  } catch (error) {
    console.error(
      "OPEN EDIT ORDER ERROR:",
      error
    );

    alert(
      error.message ||
        "Failed to load order for editing."
    );
  }
}
  function closeModal() {
    if (saving) {
      return;
    }

    setOpen(false);
    resetForm();
  }

  function addService() {
    setForm(
      (previous) => ({
        ...previous,
        services: [
          ...previous.services,
          {
            service_id: "",
            quantity: 1,
            approved_date: "",
            notes: "",
            file: null,
          },
        ],
      })
    );
  }

  function removeService(index) {
    setForm(
      (previous) => ({
        ...previous,
        services:
          previous.services.filter(
            (_, serviceIndex) =>
              serviceIndex !==
              index
          ),
      })
    );
  }

  function updateService(
    index,
    field,
    value
  ) {
    setForm(
      (previous) => ({
        ...previous,
        services:
          previous.services.map(
            (
              service,
              serviceIndex
            ) =>
              serviceIndex ===
              index
                ? {
                    ...service,
                    [field]:
                      value,
                  }
                : service
          ),
      })
    );
  }

  function handleFileChange(
    index,
    file
  ) {
    updateService(
      index,
      "file",
      file || null
    );
  }

  async function uploadOrderFile(file, customerId) {
    if (!file) return null;

    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Each order file must be 20 MB or smaller.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("customer_id", String(customerId || ""));

    const response = await fetch(`${API_URL}/uploads/order-file`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.url) {
      throw new Error(
        data?.error || data?.message || "Failed to upload order file."
      );
    }

    return data;
  }

  /* =======================================================
     SAVE ORDER
  ======================================================= */

  async function saveOrder(e) {
    e.preventDefault();

    if (!form.customer_id) {
      alert(
        "Please select a customer."
      );
      return;
    }

    const customerId =
      Number(
        form.customer_id
      );

    if (
      !Number.isInteger(
        customerId
      ) ||
      customerId <= 0
    ) {
      alert(
        "Invalid customer selected."
      );
      return;
    }

    const customer =
      customers.find(
        (item) =>
          Number(item.id) ===
          customerId
      );

    if (!customer) {
      alert(
        "Customer not found."
      );
      return;
    }

    if (
      form.order_type === "service" &&
      !form.services.length
    ) {
      alert(
        "Please add at least one service."
      );
      return;
    }

    const orderServices = [];

    for (
      let index = 0;
      index <
      (form.order_type === "service" ? form.services.length : 0);
      index++
    ) {
      const item =
        form.services[index];

      if (!item.service_id) {
        alert(
          `Please select a service for item ${
            index + 1
          }.`
        );
        return;
      }

      const serviceId =
        Number(
          item.service_id
        );

      const service =
        services.find(
          (serviceItem) =>
            Number(
              serviceItem.id
            ) === serviceId
        );

      if (!service) {
        alert(
          `Service not found for item ${
            index + 1
          }.`
        );
        return;
      }

      const quantity =
        Number(
          item.quantity
        );

      if (
        !Number.isFinite(
          quantity
        ) ||
        quantity <= 0
      ) {
        alert(
          `Please enter a valid quantity for ${service.name}.`
        );
        return;
      }

      const requiresFile =
        Number(
          service.allow_file_upload
        ) === 1 ||
        service.allow_file_upload ===
          true;

      let fileData = null;
      let fileName = null;
      let fileType = null;
      let fileSize = 0;

      if (item.file) {
        try {
          const uploaded = await uploadOrderFile(item.file, customerId);
          fileData = uploaded.url;
          fileName = uploaded.file_name || item.file.name;
          fileType = uploaded.file_type || item.file.type || "application/octet-stream";
          fileSize = Number(uploaded.file_size || item.file.size || 0);
        } catch (error) {
          alert(
            error.message ||
              `Failed to upload the file for ${service.name}.`
          );
          return;
        }
      } else if (
        item.existing_file_data
      ) {
        fileData =
          item.existing_file_data;

        fileName =
          item.existing_file_name;

        fileType =
          item.existing_file_type;

        fileSize =
          Number(
            item.existing_file_size ||
              0
          );
      }

      if (
        requiresFile &&
        !fileData
      ) {
        alert(
          `Please upload a file for ${service.name}.`
        );
        return;
      }

      if (
        !item.approved_date
      ) {
        alert(
          `Please select an approved date for ${service.name}.`
        );
        return;
      }

      orderServices.push({
        service_id:
          serviceId,

        quantity,

        approved_date:
          item.approved_date,

        notes:
          String(
            item.notes || ""
          ),

        file_name:
          fileName,

        file_type:
          fileType,

        file_size:
          fileSize,

        file_data:
          fileData,
      });
    }

    let productImageData = null;
    let productImageName = null;
    let productImageType = null;
    let productImageSize = 0;

    if (form.order_type !== "service" && form.product_image) {
      try {
        const uploaded = await uploadOrderFile(form.product_image, customerId);
        productImageData = uploaded.url;
        productImageName = uploaded.file_name || form.product_image.name;
        productImageType = uploaded.file_type || form.product_image.type || "image/*";
        productImageSize = Number(uploaded.file_size || form.product_image.size || 0);
      } catch (error) {
        alert(error.message || "Failed to upload product picture.");
        return;
      }
    }

    if (form.order_type !== "service") {
      const directPrice = Number(form.custom_price);
      if (!Number.isFinite(directPrice) || directPrice < 0) {
        alert("Please enter a valid price.");
        return;
      }
      if (!form.order_date) {
        alert("Please select an order date.");
        return;
      }
    }

    const orderData = {
      customer_id: customerId,
      order_type: form.order_type,
      order_date: form.order_date || null,
      custom_price: form.custom_price || null,
      product_image: productImageData,
      product_image_name: productImageName,
      product_image_type: productImageType,
      product_image_size: productImageSize,
      status: form.status || "pending",
      notes: String(form.notes || ""),
      services: orderServices,
    };

    try {
      setSaving(true);

      let response;

      if (editingOrder) {
        response =
          await fetch(
            `${API_URL}/orders/${editingOrder.id}`,
            {
              method: "PUT",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body:
                JSON.stringify(
                  orderData
                ),
            }
          );
      } else {
        response =
          await fetch(
            `${API_URL}/orders`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body:
                JSON.stringify(
                  orderData
                ),
            }
          );
      }

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Failed to save order."
        );
      }

      setOpen(false);
      resetForm();

      await loadOrders();
    } catch (error) {
      console.error(
        "SAVE ORDER ERROR:",
        error
      );

      alert(
        error.message ||
          "Failed to save order."
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     ORDER STATUS
  ======================================================= */

  async function updateStatus(
    order,
    status
  ) {
    if (
      order.status ===
      status
    ) {
      return;
    }

    const allowedStatuses = [
      "pending",
      "pending_payment",
      "processing",
      "pending_approval",
      "completed",
      "cancelled",
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      alert(
        "Invalid order status."
      );
      return;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/orders/${order.id}/status`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body:
              JSON.stringify({
                status,
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
            "Failed to update status."
        );
      }

      await loadOrders();
    } catch (error) {
      console.error(
        "UPDATE STATUS ERROR:",
        error
      );

      alert(
        error.message ||
          "Failed to update status."
      );
    }
  }

  /* =======================================================
     DELETE ORDER
  ======================================================= */

  async function deleteOrder(
    order
  ) {
    const confirmed =
      window.confirm(
        `Delete order #ORD-${String(
          order.public_order_number ||
            order.id
        )}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/orders/${order.id}`,
          {
            method: "DELETE",
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
            "Failed to delete order."
        );
      }

      await loadOrders();
    } catch (error) {
      console.error(
        "DELETE ORDER ERROR:",
        error
      );

      alert(
        error.message ||
          "Failed to delete order."
      );
    }
  }

  /* =======================================================
     FILTER ORDERS
  ======================================================= */

  const filteredOrders =
    orders.filter(
      (order) => {
        const query =
          search
            .toLowerCase()
            .trim();

        if (!query) {
          return true;
        }

        return (
          String(
            order.id || ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            order.public_order_number ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            order.customer_name ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            order.customer_code ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            order.service_name ||
              ""
          )
            .toLowerCase()
            .includes(query) ||

          String(
            order.status || ""
          )
            .toLowerCase()
            .includes(query)
        );
      }
    );

  /* =======================================================
     SELECTED CUSTOMER
  ======================================================= */

  const selectedCustomer =
    customers.find(
      (customer) =>
        String(
          customer.id
        ) ===
        String(
          form.customer_id
        )
    );

  /* =======================================================
     ORDER TOTAL
  ======================================================= */

  const orderTotal =
    form.order_type !== "service"
      ? Number(form.custom_price || 0)
      : form.services.reduce(
      (sum, item) => {
        const service =
          services.find(
            (serviceItem) =>
              String(
                serviceItem.id
              ) ===
              String(
                item.service_id
              )
          );

        const price =
          Number(
            service?.price || 0
          );

        const quantity =
          Number(
            item.quantity || 0
          );

        return (
          sum +
          price * quantity
        );
      },
      0
    );

  /* =======================================================
     STATUS
  ======================================================= */

  function statusIcon(
    status
  ) {
    if (
      status ===
      "completed"
    ) {
      return (
        <CheckCircle2
          size={14}
        />
      );
    }

    if (
      status ===
      "processing"
    ) {
      return (
        <LoaderCircle
          size={14}
        />
      );
    }

    if (
      status ===
        "cancelled" ||
      status ===
        "canceled"
    ) {
      return (
        <Ban size={14} />
      );
    }

    return (
      <Clock size={14} />
    );
  }

  function statusClass(
    status
  ) {
    return `order-status-badge ${
      status || "pending"
    }`;
  }

  /* =======================================================
     PENDING REQUEST COUNT
  ======================================================= */

  const pendingRequestCount =
    requests.filter(
      (request) =>
        !request.order_id &&
        String(
          request.quote_status ||
            "pending"
        ).toLowerCase() ===
          "pending"
    ).length;

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="orders-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="page-heading">

        <div>
          <p className="eyebrow">
            ORDER MANAGEMENT
          </p>

          <h1>
            Orders
          </h1>

          <p>
            Manage orders and customer
            requests from one place.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >

          <button
            type="button"
            className="icon-button"
            onClick={() => {
              loadOrders();
              refreshRequests();
            }}
            title="Refresh"
          >
            <RefreshCw
              size={17}
            />
          </button>

          {activeTab ===
            "orders" && (
            <button
              type="button"
              className="primary-button"
              onClick={
                openCreateOrder
              }
            >
              <Plus size={17} />
              Create Order
            </button>
          )}

        </div>

      </div>

      {/* =================================================
          TABS
      ================================================= */}

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "18px",
          borderBottom:
            "1px solid rgba(255,255,255,.07)",
          paddingBottom: "12px",
        }}
      >

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "orders"
            )
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding:
              "10px 16px",
            borderRadius:
              "10px",
            border:
              activeTab ===
              "orders"
                ? "1px solid rgba(139,92,246,.45)"
                : "1px solid transparent",
            background:
              activeTab ===
              "orders"
                ? "linear-gradient(135deg, rgba(139,92,246,.22), rgba(139,92,246,.08))"
                : "rgba(255,255,255,.025)",
            color:
              activeTab ===
              "orders"
                ? "#c4b5fd"
                : "#8e879d",
            cursor:
              "pointer",
            fontWeight: 700,
          }}
        >
          <ShoppingBag
            size={16}
          />

          Orders

          <span
            style={{
              minWidth: "22px",
              height: "22px",
              display:
                "inline-flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              borderRadius:
                "999px",
              background:
                "rgba(139,92,246,.18)",
              color:
                "#b794ff",
              fontSize:
                "12px",
            }}
          >
            {orders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "requests"
            )
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding:
              "10px 16px",
            borderRadius:
              "10px",
            border:
              activeTab ===
              "requests"
                ? "1px solid rgba(139,92,246,.45)"
                : "1px solid transparent",
            background:
              activeTab ===
              "requests"
                ? "linear-gradient(135deg, rgba(139,92,246,.22), rgba(139,92,246,.08))"
                : "rgba(255,255,255,.025)",
            color:
              activeTab ===
              "requests"
                ? "#c4b5fd"
                : "#8e879d",
            cursor:
              "pointer",
            fontWeight: 700,
          }}
        >
          <MessageCircle
            size={16}
          />

          Customer Requests

          {pendingRequestCount >
            0 && (
            <span
              style={{
                minWidth: "22px",
                height: "22px",
                display:
                  "inline-flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                borderRadius:
                  "999px",
                background:
                  "#8b5cf6",
                color:
                  "#fff",
                fontSize:
                  "12px",
                fontWeight: 800,
              }}
            >
              {
                pendingRequestCount
              }
            </span>
          )}
        </button>

      </div>

      {/* =================================================
          CUSTOMER REQUESTS
      ================================================= */}

      {activeTab ===
        "requests" && (
        <div>

          {/* TOOLBAR */}

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems:
                "center",
              marginBottom:
                "18px",
              flexWrap:
                "wrap",
            }}
          >

            <div
              className="orders-search"
              style={{
                flex: 1,
                minWidth:
                  "260px",
              }}
            >
              <Search
                size={17}
              />

              <input
                type="text"
                placeholder="Search customer requests..."
                value={
                  requestSearch
                }
                onChange={(
                  e
                ) =>
                  setRequestSearch(
                    e.target.value
                  )
                }
              />
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={
                refreshRequests
              }
              disabled={
                requestsLoading
              }
              style={{
                display:
                  "inline-flex",
                alignItems:
                  "center",
                gap: "7px",
              }}
            >
              <RefreshCw
                size={15}
                className={
                  requestsLoading
                    ? "spin"
                    : ""
                }
              />

              Refresh Requests
            </button>

          </div>

          {/* REQUEST LIST */}

          {requestsLoading ? (
            <div className="dashboard-empty">

              <LoaderCircle
                size={28}
                className="spin"
              />

              <p>
                Loading customer
                requests...
              </p>

            </div>
          ) : filteredRequests.length ===
            0 ? (
            <div className="dashboard-empty">

              <MessageCircle
                size={30}
              />

              <h2>
                No customer requests
              </h2>

              <p>
                New service, China,
                and Vietnam requests
                will appear here.
              </p>

            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "14px",
              }}
            >

              {filteredRequests.map(
                (request) => {

                  const status =
                    requestStatusClass(
                      request
                    );

                  return (
                    <button
                      key={
                        request.id
                      }
                      type="button"
                      onClick={() =>
                        openRequest(
                          request
                        )
                      }
                      style={{
                        textAlign:
                          "left",
                        width:
                          "100%",
                        border:
                          "1px solid rgba(255,255,255,.08)",
                        borderRadius:
                          "16px",
                        padding:
                          "18px",
                        background:
                          "linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018))",
                        color:
                          "#fff",
                        cursor:
                          "pointer",
                        transition:
                          "transform .18s ease, border-color .18s ease",
                      }}
                    >

                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap: "10px",
                        }}
                      >

                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "10px",
                          }}
                        >

                          <div
                            style={{
                              width:
                                "38px",
                              height:
                                "38px",
                              borderRadius:
                                "11px",
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              background:
                                "rgba(139,92,246,.14)",
                              color:
                                "#a78bfa",
                              border:
                                "1px solid rgba(139,92,246,.25)",
                            }}
                          >
                            {
                              requestTypeIcon(
                                request.request_type
                              )
                            }
                          </div>

                          <div>

                            <div
                              style={{
                                fontSize:
                                  "12px",
                                color:
                                  "#958da6",
                                textTransform:
                                  "uppercase",
                                letterSpacing:
                                  ".08em",
                                fontWeight:
                                  700,
                              }}
                            >
                              {
                                requestTypeLabel(
                                  request.request_type
                                )
                              }
                            </div>

                            <strong
                              style={{
                                display:
                                  "block",
                                marginTop:
                                  "3px",
                                fontSize:
                                  "16px",
                              }}
                            >
                              {request.service_name ||
                                request.product_name ||
                                "Customer Request"}
                            </strong>

                          </div>

                        </div>

                        <span
                          style={{
                            padding:
                              "5px 8px",
                            borderRadius:
                              "999px",
                            background:
                              status ===
                              "waiting"
                                ? "rgba(245,158,11,.12)"
                                : status ===
                                  "quoted"
                                ? "rgba(139,92,246,.14)"
                                : status ===
                                  "accepted"
                                ? "rgba(34,197,94,.12)"
                                : "rgba(239,68,68,.12)",
                            color:
                              status ===
                              "waiting"
                                ? "#fbbf24"
                                : status ===
                                  "quoted"
                                ? "#c4b5fd"
                                : status ===
                                  "accepted"
                                ? "#86efac"
                                : "#fca5a5",
                            fontSize:
                              "11px",
                            fontWeight:
                              800,
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {
                            requestStatusLabel(
                              request
                            )
                          }
                        </span>

                      </div>

                      <div
                        style={{
                          marginTop:
                            "15px",
                          paddingTop:
                            "13px",
                          borderTop:
                            "1px solid rgba(255,255,255,.06)",
                        }}
                      >

                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            gap: "12px",
                            marginBottom:
                              "8px",
                          }}
                        >

                          <span
                            style={{
                              color:
                                "#c7c0d1",
                              fontWeight:
                                650,
                            }}
                          >
                            {
                              request.customer_name ||
                              "Unknown Customer"
                            }
                          </span>

                          <span
                            style={{
                              color:
                                "#746d7f",
                              fontSize:
                                "12px",
                            }}
                          >
                            {
                              request.customer_code ||
                              ""
                            }
                          </span>

                        </div>

                        {request.product_link && (
                          <div
                            style={{
                              color:
                                "#9f8cff",
                              fontSize:
                                "12px",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              request.product_link
                            }
                          </div>
                        )}

                        {request.details && (
                          <p
                            style={{
                              margin:
                                "9px 0 0",
                              color:
                                "#8e879d",
                              fontSize:
                                "13px",
                              lineHeight:
                                1.5,
                              display:
                                "-webkit-box",
                              WebkitLineClamp:
                                2,
                              WebkitBoxOrient:
                                "vertical",
                              overflow:
                                "hidden",
                            }}
                          >
                            {
                              request.details
                            }
                          </p>
                        )}

                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          marginTop:
                            "14px",
                          color:
                            "#746d7f",
                          fontSize:
                            "12px",
                        }}
                      >

                        <span>
                          {formatDateTime(
                            request.created_at
                          )}
                        </span>

                        <ChevronRight
                          size={16}
                        />

                      </div>

                    </button>
                  );
                }
              )}

            </div>
          )}

        </div>
      )}

      {/* =================================================
          NORMAL ORDERS
      ================================================= */}

      {activeTab ===
        "orders" && (
        <>

          <div
            className="orders-toolbar"
          >

            <div
              className="orders-search"
            >

              <Search
                size={17}
              />

              <input
                type="text"
                placeholder="Search orders..."
                value={
                  search
                }
                onChange={(
                  e
                ) =>
                  setSearch(
                    e.target.value
                  )
                }
              />

            </div>

          </div>

          {loading ? (
            <div className="dashboard-empty">

              <LoaderCircle
                size={28}
                className="spin"
              />

              <p>
                Loading orders...
              </p>

            </div>
          ) : filteredOrders.length ===
            0 ? (
            <div className="dashboard-empty">

              <ShoppingBag
                size={30}
              />

              <h2>
                No orders found
              </h2>

              <p>
                Create your first
                customer order.
              </p>

              <button
                type="button"
                className="primary-button"
                onClick={
                  openCreateOrder
                }
              >
                <Plus size={17} />
                Create Order
              </button>

            </div>
          ) : (
            <div
              className="orders-list"
            >

              {filteredOrders.map(
                (order) => (
                  <div
                    className="order-card"
                    key={
                      order.id
                    }
                  >

                    <div className="order-number">

                      <span>
                        ORDER
                      </span>

                      <strong>
                        #ORD-
                        {
                          order.public_order_number ||
                          order.id
                        }
                      </strong>

                    </div>

                    <div className="order-customer-info">

                      <div className="order-customer-name">
                        {
                          order.customer_name ||
                          "Unknown Customer"
                        }
                      </div>

                      <div className="order-customer-label">
                        {
                          order.customer_code ||
                          "Customer"
                        }
                      </div>

                    </div>

                    <div className="order-service">
  {Array.isArray(order.services) &&
  order.services.length > 0 ? (
    order.services.map(
      (item, itemIndex) => (
        <div
          key={
            item.id ||
            itemIndex
          }
          style={{
            marginBottom: "5px",
          }}
        >
          <strong>
            {getServiceName(
              item,
              services
            )}
          </strong>

          <span>
            Qty:{" "}
            {item.quantity || 1}
          </span>

          {item.approved_date && (
            <span>
              Approved:{" "}
              {item.approved_date}
            </span>
          )}
        </div>
      )
    )
  ) : (
    <strong>
      {getServiceName(
        order,
        services
      )}
    </strong>
  )}
</div>

                    <div className="order-status-area">

                      <select
                        className={statusClass(
                          order.status
                        )}
                        value={
                          order.status ||
                          "pending"
                        }
                        onChange={(
                          e
                        ) =>
                          updateStatus(
                            order,
                            e.target
                              .value
                          )
                        }
                      >

                        <option value="pending">
                          Pending
                        </option>

                        <option value="pending_payment">
                          Pending Payment
                        </option>

                        <option value="processing">
  Processing
</option>

<option value="pending_approval">
  Pending Approval
</option>

<option value="completed">
  Completed
</option>

                        <option value="cancelled">
                          Cancelled
                        </option>

                      </select>

                    </div>

                    <div className="order-total">

                      <span>
                        Total
                      </span>

                      <strong>
                        {formatUSD(
                          order.total
                        )}
                      </strong>

                    </div>

                    <div className="order-actions">

                      <button
                        type="button"
                        className="icon-button"
                        title="Edit Order"
                        onClick={() =>
                          openEditOrder(
                            order
                          )
                        }
                      >
                        <Pencil
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        className="icon-button danger"
                        title="Delete Order"
                        onClick={() =>
                          deleteOrder(
                            order
                          )
                        }
                      >
                        <Trash2
                          size={16}
                        />
                      </button>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </>
      )}

      {/* =================================================
          REQUEST DETAIL MODAL
      ================================================= */}

      {selectedRequest && (
        <div
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex: 1000,
            background:
              "rgba(0,0,0,.72)",
            backdropFilter:
              "blur(8px)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding:
              "20px",
          }}
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeRequest();
            }
          }}
        >

          <div
            style={{
              width:
                "min(960px, 100%)",
              maxHeight:
                "90vh",
              overflow:
                "auto",
              border:
                "1px solid rgba(139,92,246,.22)",
              borderRadius:
                "20px",
              background:
                "#0d0b12",
              boxShadow:
                "0 30px 100px rgba(0,0,0,.6)",
            }}
          >

            {/* HEADER */}

            <div
              style={{
                padding:
                  "20px 22px",
                borderBottom:
                  "1px solid rgba(255,255,255,.07)",
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
              }}
            >

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "12px",
                  alignItems:
                    "center",
                }}
              >

                <div
                  style={{
                    width:
                      "44px",
                    height:
                      "44px",
                    borderRadius:
                      "13px",
                    background:
                      "rgba(139,92,246,.15)",
                    color:
                      "#a78bfa",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                  }}
                >
                  {
                    requestTypeIcon(
                      selectedRequest.request_type
                    )
                  }
                </div>

                <div>

                  <span
                    style={{
                      color:
                        "#9f8cff",
                      fontSize:
                        "11px",
                      fontWeight:
                        800,
                      letterSpacing:
                        ".1em",
                      textTransform:
                        "uppercase",
                    }}
                  >
                    {
                      requestTypeLabel(
                        selectedRequest.request_type
                      )
                    }
                  </span>

                  <h2
                    style={{
                      margin:
                        "4px 0 0",
                      color:
                        "#fff",
                    }}
                  >
                    {selectedRequest.service_name ||
                      selectedRequest.product_name ||
                      "Customer Request"}
                  </h2>

                </div>

              </div>

              <button
                type="button"
                className="icon-button"
                onClick={
                  closeRequest
                }
              >
                <X size={18} />
              </button>

            </div>

            {requestDetailsLoading ? (
              <div
                style={{
                  padding:
                    "70px",
                  textAlign:
                    "center",
                  color:
                    "#8e879d",
                }}
              >
                <LoaderCircle
                  size={30}
                  className="spin"
                />

                <p>
                  Loading request...
                </p>

              </div>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap:
                    "0",
                }}
              >

                {/* LEFT SIDE */}

                <div
                  style={{
                    padding:
                      "22px",
                    borderRight:
                      "1px solid rgba(255,255,255,.07)",
                  }}
                >

                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap:
                        "10px",
                      marginBottom:
                        "18px",
                    }}
                  >

                    <User
                      size={17}
                      color="#a78bfa"
                    />

                    <div>

                      <strong>
                        {
                          selectedRequest.customer_name ||
                          "Unknown Customer"
                        }
                      </strong>

                      <div
                        style={{
                          color:
                            "#746d7f",
                          fontSize:
                            "12px",
                        }}
                      >
                        {
                          selectedRequest.customer_code ||
                          ""
                        }
                      </div>

                    </div>

                  </div>

                  {selectedRequest.product_link && (
                    <div
                      style={{
                        marginBottom:
                          "16px",
                      }}
                    >

                      <label
                        style={{
                          display:
                            "block",
                          color:
                            "#746d7f",
                          fontSize:
                            "11px",
                          textTransform:
                            "uppercase",
                          fontWeight:
                            800,
                          marginBottom:
                            "7px",
                        }}
                      >
                        Product Link
                      </label>

                      <a
                        href={
                          selectedRequest.product_link
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color:
                            "#a78bfa",
                          fontSize:
                            "13px",
                          wordBreak:
                            "break-all",
                        }}
                      >
                        {
                          selectedRequest.product_link
                        }

                        <ExternalLink
                          size={13}
                          style={{
                            marginLeft:
                              "5px",
                            verticalAlign:
                              "middle",
                          }}
                        />
                      </a>

                    </div>
                  )}

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap:
                        "10px",
                      marginBottom:
                        "16px",
                    }}
                  >

                    <div
                      style={{
                        padding:
                          "12px",
                        borderRadius:
                          "11px",
                        background:
                          "rgba(255,255,255,.035)",
                      }}
                    >

                      <span
                        style={{
                          display:
                            "block",
                          color:
                            "#746d7f",
                          fontSize:
                            "11px",
                        }}
                      >
                        Quantity
                      </span>

                      <strong>
                        {
                          selectedRequest.quantity ||
                          1
                        }
                      </strong>

                    </div>

                    <div
                      style={{
                        padding:
                          "12px",
                        borderRadius:
                          "11px",
                        background:
                          "rgba(255,255,255,.035)",
                      }}
                    >

                      <span
                        style={{
                          display:
                            "block",
                          color:
                            "#746d7f",
                          fontSize:
                            "11px",
                        }}
                      >
                        Deadline
                      </span>

                      <strong>
                        {
                          selectedRequest.deadline
                            ? formatDate(
                                selectedRequest.deadline
                              )
                            : "No deadline"
                        }
                      </strong>

                    </div>

                  </div>

                  <div
                    style={{
                      marginBottom:
                        "20px",
                    }}
                  >

                    <label
                      style={{
                        display:
                          "block",
                        color:
                          "#746d7f",
                        fontSize:
                          "11px",
                        textTransform:
                          "uppercase",
                        fontWeight:
                          800,
                        marginBottom:
                          "7px",
                      }}
                    >
                      Customer Details
                    </label>

                    <div
                      style={{
                        padding:
                          "13px",
                        borderRadius:
                          "11px",
                        background:
                          "rgba(255,255,255,.035)",
                        color:
                          "#b5aebe",
                        lineHeight:
                          1.6,
                        fontSize:
                          "13px",
                        whiteSpace:
                          "pre-wrap",
                      }}
                    >
                      {
                        selectedRequest.details ||
                        "No additional details."
                      }
                    </div>

                  </div>

                  {/* QUOTATION */}

                  {!selectedRequest.order_id && (
                   <form
  onSubmit={sendQuote}
>

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "8px",
                          marginBottom:
                            "12px",
                        }}
                      >

                        <DollarSign
                          size={17}
                          color="#a78bfa"
                        />

                        <strong>
                          Send Quotation
                        </strong>

                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "1fr 120px",
                          gap:
                            "8px",
                        }}
                      >

                        <input
                          type="number"
                          min="0"
                          step={
                            quoteCurrency ===
                            "KHR"
                              ? "1"
                              : "0.01"
                          }
                          placeholder={
                            quoteCurrency ===
                            "KHR"
                              ? "Amount in KHR"
                              : "Amount in USD"
                          }
                          value={
                            quoteAmount
                          }
                          onChange={(
                            e
                          ) =>
                            setQuoteAmount(
                              e.target
                                .value
                            )
                          }
                        />

                        <select
                          value={
                            quoteCurrency
                          }
                          onChange={(
                            e
                          ) =>
                            setQuoteCurrency(
                              e.target
                                .value
                            )
                          }
                        >

                          <option value="USD">
                            USD $
                          </option>

                          <option value="KHR">
                            KHR ៛
                          </option>

                        </select>

                      </div>

                      <textarea
                        style={{
                          width:
                            "100%",
                          marginTop:
                            "9px",
                          minHeight:
                            "80px",
                        }}
                        placeholder="Optional note for the customer..."
                        value={
                          quoteNote
                        }
                        onChange={(
                          e
                        ) =>
                          setQuoteNote(
                            e.target
                              .value
                          )
                        }
                      />

                      <button
                        type="submit"
                        className="primary-button"
                        disabled={
                          savingQuote
                        }
                        style={{
                          width:
                            "100%",
                          justifyContent:
                            "center",
                          marginTop:
                            "9px",
                        }}
                      >

                        {savingQuote ? (
                          <>
                            <LoaderCircle
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

                            Send Quotation
                          </>
                        )}

                      </button>

                    </form>
                  )}

                </div>

                {/* RIGHT SIDE */}

                <div
                  style={{
                    display:
                      "flex",
                    flexDirection:
                      "column",
                    minHeight:
                      "620px",
                  }}
                >

                  <div
                    style={{
                      padding:
                        "18px 20px",
                      borderBottom:
                        "1px solid rgba(255,255,255,.07)",
                    }}
                  >

                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                      }}
                    >

                      <strong>
                        Request Chat
                      </strong>

                      <span
                        style={{
                          color:
                            "#746d7f",
                          fontSize:
                            "12px",
                        }}
                      >
                        {
                          requestStatusLabel(
                            selectedRequest
                          )
                        }
                      </span>

                    </div>

                  </div>

                  <div
                    style={{
                      flex:
                        1,
                      overflowY:
                        "auto",
                      padding:
                        "18px",
                    }}
                  >

                    {Array.isArray(
                      selectedRequest.messages
                    ) &&
                    selectedRequest
                      .messages
                      .length >
                      0 ? (
                      selectedRequest.messages.map(
                        (
                          message,
                          messageIndex
                        ) => {

                          const isAdmin =
                            message.sender_type ===
                            "admin";

                          const isSystem =
                            message.sender_type ===
                            "system";

                          return (
                            <div
                              key={
                                message.id ||
                                messageIndex
                              }
                              style={{
                                display:
                                  "flex",
                                justifyContent:
                                  isAdmin
                                    ? "flex-end"
                                    : "flex-start",
                                marginBottom:
                                  "10px",
                              }}
                            >

                              <div
                                style={{
                                  maxWidth:
                                    "82%",
                                  padding:
                                    "10px 12px",
                                  borderRadius:
                                    "12px",
                                  background:
                                    isSystem
                                      ? "rgba(255,255,255,.04)"
                                      : isAdmin
                                      ? "rgba(139,92,246,.18)"
                                      : "rgba(255,255,255,.06)",
                                  border:
                                    "1px solid rgba(255,255,255,.06)",
                                }}
                              >

                                <div
                                  style={{
                                    fontSize:
                                      "12px",
                                    color:
                                      isAdmin
                                        ? "#c4b5fd"
                                        : "#d4cfd9",
                                    lineHeight:
                                      1.5,
                                    whiteSpace:
                                      "pre-wrap",
                                  }}
                                >
                                  {
                                    message.message
                                  }
                                </div>

                                <div
                                  style={{
                                    marginTop:
                                      "5px",
                                    color:
                                      "#655e70",
                                    fontSize:
                                      "10px",
                                  }}
                                >
                                  {
                                    formatDateTime(
                                      message.created_at
                                    )
                                  }
                                </div>

                              </div>

                            </div>
                          );
                        }
                      )
                    ) : (
                      <div
                        style={{
                          height:
                            "100%",
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          color:
                            "#625b6b",
                          textAlign:
                            "center",
                        }}
                      >

                        <div>

                          <MessageCircle
                            size={30}
                          />

                          <p>
                            No messages yet.
                          </p>

                        </div>

                      </div>
                    )}

                  </div>

                  {/* CHAT INPUT */}

                  <form
                    onSubmit={
                      sendRequestMessage
                    }
                    style={{
                      padding:
                        "14px",
                      borderTop:
                        "1px solid rgba(255,255,255,.07)",
                      display:
                        "flex",
                      gap:
                        "8px",
                    }}
                  >

                    <input
                      value={
                        requestMessage
                      }
                      onChange={(
                        e
                      ) =>
                        setRequestMessage(
                          e.target
                            .value
                        )
                      }
                      placeholder="Message customer..."
                      disabled={
                        sendingRequestMessage
                      }
                      style={{
                        flex:
                          1,
                      }}
                    />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={
                        sendingRequestMessage ||
                        !requestMessage.trim()
                      }
                      style={{
                        padding:
                          "10px 13px",
                      }}
                    >

                      {sendingRequestMessage ? (
                        <LoaderCircle
                          size={16}
                          className="spin"
                        />
                      ) : (
                        <Send
                          size={16}
                        />
                      )}

                    </button>

                  </form>

                </div>

              </div>
            )}

          </div>

        </div>
      )}

      {/* =================================================
          CREATE / EDIT ORDER MODAL
      ================================================= */}

      {open && (
        <div
          className="order-modal-overlay"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeModal();
            }
          }}
        >

          <form
            className="order-modal"
            onSubmit={
              saveOrder
            }
          >

            <div className="order-modal-header">

              <div className="order-modal-heading">

                <div className="order-modal-icon">
                  <ShoppingBag
                    size={21}
                  />
                </div>

                <div>

                  <h2>
                    {editingOrder
                      ? "Edit Order"
                      : "Create Order"}
                  </h2>

                  <p>
                    Add one or more
                    services to this
                    order.
                  </p>

                </div>

              </div>

              <button
                type="button"
                className="order-modal-close"
                onClick={
                  closeModal
                }
              >
                <X size={18} />
              </button>

            </div>

            {/* CUSTOMER */}

            <div className="order-form-field">

              <label>
                Customer{" "}
                <span>*</span>
              </label>

              <select
                required
                value={
                  form.customer_id
                }
                onChange={(
                  e
                ) =>
                  setForm({
                    ...form,
                    customer_id:
                      e.target
                        .value,
                  })
                }
              >

                <option value="">
                  Select customer
                </option>

                {customers.map(
                  (
                    customer
                  ) => (
                    <option
                      key={
                        customer.id
                      }
                      value={
                        customer.id
                      }
                    >
                      {
                        customer.full_name
                      }
                    </option>
                  )
                )}

              </select>

            </div>

            {selectedCustomer && (
              <div className="order-customer-type">

                {selectedCustomer.customer_type ===
                "monthly"
                  ? "Monthly Customer"
                  : "One-time Customer"}

              </div>
            )}

            {/* ORDER TYPE */}

            <div className="order-form-field">
              <label>Order Type <span>*</span></label>
              <select
                required
                value={form.order_type}
                disabled={Boolean(editingOrder)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    order_type: e.target.value,
                    custom_price: e.target.value === "service" ? "" : form.custom_price,
                  })
                }
              >
                <option value="service">Regular Service Order</option>
                <option value="china">China Order</option>
                <option value="vietnam">Vietnam Order</option>
              </select>
            </div>

            {form.order_type !== "service" && (
              <div className="order-form-row">
                <div className="order-form-field">
                  <label>Order Date <span>*</span></label>
                  <input
                    type="date"
                    required
                    value={form.order_date}
                    onChange={(e) =>
                      setForm({ ...form, order_date: e.target.value })
                    }
                  />
                </div>

                <div className="order-form-field">
                  <label>Price (USD) <span>*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.custom_price}
                    onChange={(e) =>
                      setForm({ ...form, custom_price: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}

            {form.order_type !== "service" && (
              <div className="order-form-field">
                <label>Product Picture</label>
                <label
                  className="order-file-upload"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <Upload size={18} />
                  <span>
                    {form.product_image?.name || "Choose a product picture"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        product_image: e.target.files?.[0] || null,
                      })
                    }
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            )}

            {/* SERVICES */}

            <div
              className="order-services-section"
              style={form.order_type !== "service" ? { display: "none" } : undefined}
            >

              <div className="order-services-header">

                <div>

                  <label>
                    Services{" "}
                    <span>*</span>
                  </label>

                  <p>
                    Add as many services
                    as this order needs.
                  </p>

                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={
                    addService
                  }
                >
                  <Plus size={16} />
                  Add Service
                </button>

              </div>

              {form.services.map(
                (
                  item,
                  index
                ) => {

                  const service =
                    services.find(
                      (
                        serviceItem
                      ) =>
                        String(
                          serviceItem.id
                        ) ===
                        String(
                          item.service_id
                        )
                    );

                  const price =
                    Number(
                      service?.price ||
                        0
                    );

                  const quantity =
                    Number(
                      item.quantity ||
                        0
                    );

                  const itemTotal =
                    price *
                    quantity;

                  const requiresFile =
                    Number(
                      service?.allow_file_upload
                    ) === 1 ||
                    service?.allow_file_upload ===
                      true;

                  return (
                    <div
                      className="order-service-item"
                      key={
                        index
                      }
                    >

                      <div className="order-service-item-header">
  <strong>
    {service?.name || "Select Service"}
  </strong>

  {form.services.length > 1 && (
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() =>
                              removeService(
                                index
                              )
                            }
                          >
                            <Trash2
                              size={15}
                            />
                          </button>
                        )}

                      </div>

                      <div className="order-form-field">

                        <label>
                          Service{" "}
                          <span>*</span>
                        </label>

                        <select
                          required={form.order_type === "service"}
                          value={
                            item.service_id
                          }
                          onChange={(
                            e
                          ) =>
                            updateService(
                              index,
                              "service_id",
                              e.target
                                .value
                            )
                          }
                        >

                          <option value="">
                            Select service
                          </option>

                         {services
  .filter(
    (serviceOption) =>
      Number(serviceOption.active) === 1 ||
      serviceOption.active === true
  )
  .map(
    (serviceOption) => (
                              <option
                                key={
                                  serviceOption.id
                                }
                                value={
                                  serviceOption.id
                                }
                              >
                                {
                                  serviceOption.name
                                } —{" "}
                                {formatUSD(
                                  serviceOption.price
                                )}
                              </option>
                            )
                          )}

                        </select>

                      </div>

                      <div className="order-form-row">

                        <div className="order-form-field">

                          <label>
                            Quantity{" "}
                            <span>*</span>
                          </label>

                          <input
                            type="number"
                            min="1"
                            value={
                              item.quantity
                            }
                            onChange={(
                              e
                            ) =>
                              updateService(
                                index,
                                "quantity",
                                e.target
                                  .value
                              )
                            }
                          />

                        </div>

                        <div className="order-form-field">

                          <label>
                            Approved Date{" "}
                            <span>*</span>
                          </label>

                          <div
                            style={{
                              position:
                                "relative",
                            }}
                          >

                            <CalendarDays
                              size={16}
                              style={{
                                position:
                                  "absolute",
                                left:
                                  "12px",
                                top:
                                  "50%",
                                transform:
                                  "translateY(-50%)",
                                pointerEvents:
                                  "none",
                              }}
                            />

                            <input
                              type="date"
                              required={form.order_type === "service"}
                              value={
                                item.approved_date
                              }
                              onChange={(
                                e
                              ) =>
                                updateService(
                                  index,
                                  "approved_date",
                                  e.target
                                    .value
                                )
                              }
                              style={{
                                paddingLeft:
                                  "38px",
                              }}
                            />

                          </div>

                        </div>

                      </div>

                      {service &&
                        requiresFile && (
                          <div className="order-form-field">

                            <label>
                              Upload File{" "}
                              <span>*</span>
                            </label>

                            <label
                              className="order-file-upload"
                              style={{
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                gap:
                                  "10px",
                                cursor:
                                  "pointer",
                              }}
                            >

                              <Upload
                                size={18}
                              />

                              <span>
                                {item.file
                                  ? item
                                      .file
                                      .name
                                  : item.existing_file_name ||
                                    "Choose a file"}
                              </span>

                              <input
                                type="file"
                                onChange={(
                                  e
                                ) =>
                                  handleFileChange(
                                    index,
                                    e
                                      .target
                                      .files?.[0]
                                  )
                                }
                                style={{
                                  display:
                                    "none",
                                }}
                              />

                            </label>

                          </div>
                        )}

                      <div className="order-form-field">

                        <label>
                          Service Notes
                        </label>

                        <textarea
                          placeholder="Notes for this service..."
                          value={
                            item.notes
                          }
                          onChange={(
                            e
                          ) =>
                            updateService(
                              index,
                              "notes",
                              e.target
                                .value
                            )
                          }
                        />

                      </div>

                      <div className="order-service-item-total">

                        <span>
                          Service Total
                        </span>

                        <strong>
                          {formatUSD(
                            itemTotal
                          )}
                        </strong>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

            {/* TOTAL */}

            <div className="order-price-summary">

              <div className="order-price-box">

                <span>
                  Services
                </span>

                <strong>
                  {
                    form.services
                      .length
                  }
                </strong>

              </div>

              <div className="order-price-box total">

                <span>
                  Order Total
                </span>

                <strong>
                  {formatUSD(
                    orderTotal
                  )}
                </strong>

              </div>

            </div>

            {/* STATUS */}

            <div className="order-form-field">

              <label>
                Order Status
              </label>

              <select
                value={
                  form.status
                }
                onChange={(
                  e
                ) =>
                  setForm({
                    ...form,
                    status:
                      e.target
                        .value,
                  })
                }
              >

                <option value="pending">
                  Pending
                </option>

                <option value="pending_payment">
                  Pending Payment
                </option>

                <option value="processing">
                  Processing
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="cancelled">
                  Cancelled
                </option>

              </select>

            </div>

            {/* NOTES */}

            <div className="order-form-field">

              <label>
                Order Notes
              </label>

              <textarea
                placeholder="Optional notes for the whole order..."
                value={
                  form.notes
                }
                onChange={(
                  e
                ) =>
                  setForm({
                    ...form,
                    notes:
                      e.target
                        .value,
                  })
                }
              />

            </div>

            {/* ACTIONS */}

            <div className="order-form-actions">

              <button
                type="button"
                className="order-cancel-button"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="order-create-button"
                disabled={
                  saving
                }
              >

                {saving ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="spin"
                    />

                    Saving...
                  </>
                ) : (
                  <>
                    {editingOrder ? (
                      <Save
                        size={17}
                      />
                    ) : (
                      <Plus
                        size={17}
                      />
                    )}

                    {editingOrder
                      ? "Save Changes"
                      : "Create Order"}
                  </>
                )}

              </button>

            </div>

          </form>

        </div>
      )}

    </div>
  );
}

export default Orders;