import { useEffect, useState } from "react";

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
  FileText,
  CalendarDays,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [saving, setSaving] = useState(false);

  // =====================================================
  // FORM
  // =====================================================

  const [form, setForm] = useState({
    customer_id: "",
    status: "pending",
    notes: "",
    services: [],
  });

  // =====================================================
  // LOAD
  // =====================================================

  useEffect(() => {
    loadOrders();
    loadCustomers();
    loadServices();
  }, []);

  async function loadCustomers() {
    try {
      const response = await fetch(`${API_URL}/customers`);

      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      const data = await response.json();

      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load customers:", error);
      setCustomers([]);
    }
  }

  async function loadServices() {
    try {
      const response = await fetch(`${API_URL}/services`);

      if (!response.ok) {
        throw new Error("Failed to load services");
      }

      const data = await response.json();

      setServices(
        Array.isArray(data)
          ? data.filter(
              (service) =>
                Number(service.active) === 1 ||
                service.active === true
            )
          : []
      );
    } catch (error) {
      console.error("Failed to load services:", error);
      setServices([]);
    }
  }

  async function loadOrders() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/orders`);

      if (!response.ok) {
        throw new Error("Failed to load orders");
      }

      const data = await response.json();

      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // RESET
  // =====================================================

  function resetForm() {
    setForm({
      customer_id: "",
      status: "pending",
      notes: "",
      services: [],
    });

    setEditingOrder(null);
  }

  // =====================================================
  // CREATE
  // =====================================================

  function openCreateOrder() {
    resetForm();

    setForm({
      customer_id: "",
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

  // =====================================================
  // EDIT
  // =====================================================

  function openEditOrder(order) {
    const existingServices =
      Array.isArray(order.services) && order.services.length > 0
        ? order.services.map((item) => ({
            service_id: String(item.service_id || ""),
            quantity: Number(item.quantity || 1),
            approved_date: item.approved_date || "",
            notes: item.notes || "",
            file: null,
            existing_file_name: item.file_name || null,
            existing_file_data: item.file_data || null,
            existing_file_type: item.file_type || null,
            existing_file_size: item.file_size || 0,
          }))
        : [
            {
              service_id: String(order.service_id || ""),
              quantity: Number(order.quantity || 1),
              approved_date: order.approved_date || "",
              notes: order.notes || "",
              file: null,
              existing_file_name: order.file_name || null,
              existing_file_data: order.file_data || null,
              existing_file_type: order.file_type || null,
              existing_file_size: order.file_size || 0,
            },
          ];

    setEditingOrder(order);

    setForm({
      customer_id:
        order.customer_id !== null &&
        order.customer_id !== undefined
          ? String(order.customer_id)
          : "",

      status: order.status || "pending",

      notes: order.notes || "",

      services: existingServices,
    });

    setOpen(true);
  }

  // =====================================================
  // CLOSE
  // =====================================================

  function closeModal() {
    if (saving) return;

    setOpen(false);
    resetForm();
  }

  // =====================================================
  // ADD SERVICE
  // =====================================================

  function addService() {
    setForm((previous) => ({
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
    }));
  }

  // =====================================================
  // REMOVE SERVICE
  // =====================================================

  function removeService(index) {
    setForm((previous) => ({
      ...previous,

      services: previous.services.filter(
        (_, serviceIndex) => serviceIndex !== index
      ),
    }));
  }

  // =====================================================
  // UPDATE SERVICE
  // =====================================================

  function updateService(index, field, value) {
    setForm((previous) => ({
      ...previous,

      services: previous.services.map((service, serviceIndex) =>
        serviceIndex === index
          ? {
              ...service,
              [field]: value,
            }
          : service
      ),
    }));
  }

  // =====================================================
  // FILE
  // =====================================================

  function handleFileChange(index, file) {
    updateService(index, "file", file || null);
  }

  // =====================================================
  // BASE64
  // =====================================================

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(
          new Error("Failed to read the selected file.")
        );
      };

      reader.readAsDataURL(file);
    });
  }

  // =====================================================
  // SAVE ORDER
  // =====================================================

  async function saveOrder(e) {
    e.preventDefault();

    // ---------------------------------------------------
    // CUSTOMER
    // ---------------------------------------------------

    if (!form.customer_id) {
      alert("Please select a customer.");
      return;
    }

    const customerId = Number(form.customer_id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
      alert("Invalid customer selected.");
      return;
    }

    const customer = customers.find(
      (item) => Number(item.id) === customerId
    );

    if (!customer) {
      alert("Customer not found.");
      return;
    }

    // ---------------------------------------------------
    // SERVICES
    // ---------------------------------------------------

    if (!form.services.length) {
      alert("Please add at least one service.");
      return;
    }

    // ---------------------------------------------------
    // VALIDATE + BUILD SERVICES
    // ---------------------------------------------------

    const orderServices = [];

    for (let index = 0; index < form.services.length; index++) {
      const item = form.services[index];

      if (!item.service_id) {
        alert(`Please select a service for item ${index + 1}.`);
        return;
      }

      const serviceId = Number(item.service_id);

      if (!Number.isInteger(serviceId) || serviceId <= 0) {
        alert(`Invalid service for item ${index + 1}.`);
        return;
      }

      const service = services.find(
        (serviceItem) =>
          Number(serviceItem.id) === serviceId
      );

      if (!service) {
        alert(`Service not found for item ${index + 1}.`);
        return;
      }

      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        alert(
          `Please enter a valid quantity for ${service.name}.`
        );
        return;
      }

      // -------------------------------------------------
      // FILE
      // -------------------------------------------------

      const requiresFile =
        Number(service.allow_file_upload) === 1 ||
        service.allow_file_upload === true;

      let fileData = null;
      let fileName = null;
      let fileType = null;
      let fileSize = 0;

      if (item.file) {
        try {
          fileData = await fileToBase64(item.file);

          fileName = item.file.name;
          fileType =
            item.file.type ||
            "application/octet-stream";
          fileSize = item.file.size;
        } catch (error) {
          alert(
            error.message ||
              "Failed to read the selected file."
          );
          return;
        }
      } else if (item.existing_file_data) {
        fileData = item.existing_file_data;
        fileName = item.existing_file_name;
        fileType = item.existing_file_type;
        fileSize = Number(
          item.existing_file_size || 0
        );
      }

      if (requiresFile && !fileData) {
        alert(
          `Please upload a file for ${service.name}.`
        );
        return;
      }

      // -------------------------------------------------
      // APPROVED DATE
      // -------------------------------------------------

      if (!item.approved_date) {
        alert(
          `Please select an approved date for ${service.name}.`
        );
        return;
      }

      // -------------------------------------------------
      // ADD ITEM
      // -------------------------------------------------

      orderServices.push({
        service_id: serviceId,
        quantity,

        approved_date:
          item.approved_date,

        notes: String(item.notes || ""),

        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        file_data: fileData,
      });
    }

    // ---------------------------------------------------
    // BUILD BODY
    // ---------------------------------------------------

    const orderData = {
      customer_id: customerId,

      status:
        form.status || "pending",

      notes:
        String(form.notes || ""),

      services: orderServices,
    };

    console.log(
      editingOrder
        ? "UPDATING MULTI-SERVICE ORDER:"
        : "CREATING MULTI-SERVICE ORDER:",
      {
        ...orderData,
        services: orderData.services.map(
          (service) => ({
            ...service,
            file_data: service.file_data
              ? "[BASE64 FILE DATA]"
              : null,
          })
        ),
      }
    );

    // ---------------------------------------------------
    // SAVE
    // ---------------------------------------------------

    try {
      setSaving(true);

      let response;

      if (editingOrder) {
        response = await fetch(
          `${API_URL}/orders/${editingOrder.id}`,
          {
            method: "PUT",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(orderData),
          }
        );
      } else {
        response = await fetch(
          `${API_URL}/orders`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(orderData),
          }
        );
      }

      const data = await response
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

  // =====================================================
  // UPDATE STATUS
  // =====================================================

  async function updateStatus(order, status) {
    if (order.status === status) {
      return;
    }

    const allowedStatuses = [
      "pending",
      "processing",
      "completed",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      alert("Invalid order status.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/orders/${order.id}/status`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            status,
          }),
        }
      );

      const data = await response
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

  // =====================================================
  // DELETE
  // =====================================================

  async function deleteOrder(order) {
    const confirmed = window.confirm(
      `Delete order #ORD-${String(order.id).padStart(
        6,
        "0"
      )}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/orders/${order.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response
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

  // =====================================================
  // SEARCH
  // =====================================================

  const filteredOrders = orders.filter(
    (order) => {
      const query = search
        .toLowerCase()
        .trim();

      if (!query) {
        return true;
      }

      return (
        String(order.id || "")
          .toLowerCase()
          .includes(query) ||

        String(order.customer_name || "")
          .toLowerCase()
          .includes(query) ||

        String(order.customer_code || "")
          .toLowerCase()
          .includes(query) ||

        String(order.service_name || "")
          .toLowerCase()
          .includes(query) ||

        String(order.status || "")
          .toLowerCase()
          .includes(query)
      );
    }
  );

  // =====================================================
  // STATUS ICON
  // =====================================================

  function statusIcon(status) {
    if (status === "completed") {
      return <CheckCircle2 size={14} />;
    }

    if (status === "processing") {
      return <LoaderCircle size={14} />;
    }

    if (status === "cancelled") {
      return <Ban size={14} />;
    }

    return <Clock size={14} />;
  }

  function statusClass(status) {
    return `order-status-badge ${
      status || "pending"
    }`;
  }

  // =====================================================
  // SELECTED CUSTOMER
  // =====================================================

  const selectedCustomer = customers.find(
    (customer) =>
      String(customer.id) ===
      String(form.customer_id)
  );

  // =====================================================
  // TOTAL
  // =====================================================

  const orderTotal = form.services.reduce(
    (sum, item) => {
      const service = services.find(
        (serviceItem) =>
          String(serviceItem.id) ===
          String(item.service_id)
      );

      const price = Number(
        service?.price || 0
      );

      const quantity = Number(
        item.quantity || 0
      );

      return sum + price * quantity;
    },
    0
  );

  // =====================================================
  // UI
  // =====================================================

  return (
    <div>

      {/* =================================================
          HEADER
      ================================================= */}

      <div>
        <p className="eyebrow">
          ORDER MANAGEMENT
        </p>

        <h1>Orders</h1>

        <p>
          Create and manage customer
          orders.
        </p>
      </div>

      <button
        className="primary-button"
        onClick={openCreateOrder}
      >
        <Plus size={17} />
        Create Order
      </button>

      {/* =================================================
          SEARCH
      ================================================= */}

      <div className="orders-search">
        <Search size={17} />

        <input
          placeholder="Search orders..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />
      </div>

      {/* =================================================
          ORDERS
      ================================================= */}

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

      ) : filteredOrders.length === 0 ? (

        <div className="dashboard-empty">

          <ShoppingBag size={30} />

          <h2>
            No orders found
          </h2>

          <p>
            Create your first
            customer order.
          </p>

          <button
            className="primary-button"
            onClick={openCreateOrder}
          >
            <Plus size={17} />
            Create Order
          </button>

        </div>

      ) : (

        filteredOrders.map(
          (order) => (

            <div
              className="order-card"
              key={order.id}
            >

              {/* ORDER */}

              <div className="order-number">
                <span>ORDER</span>

                <strong>
                  #ORD-
                  {String(
                    order.id
                  ).padStart(
                    6,
                    "0"
                  )}
                </strong>
              </div>

              {/* CUSTOMER */}

              <div className="order-customer-info">

                <div className="order-customer-name">
                  {order.customer_name ||
                    "Unknown Customer"}
                </div>

                <div className="order-customer-label">
                  {order.customer_code ||
                    "Customer"}
                </div>

              </div>

              {/* SERVICES */}

              <div className="order-service">

                {Array.isArray(
                  order.services
                ) &&
                order.services.length > 0 ? (

                  order.services.map(
                    (item) => (

                      <div
                        key={item.id}
                        style={{
                          marginBottom:
                            "5px",
                        }}
                      >

                        <strong>
                          {item.service_name ||
                            "Service"}
                        </strong>

                        <span>
                          Qty:{" "}
                          {item.quantity ||
                            1}
                        </span>

                        {item.approved_date && (
                          <span>
                            Approved:{" "}
                            {
                              item.approved_date
                            }
                          </span>
                        )}

                      </div>

                    )
                  )

                ) : (

                  <strong>
                    {order.service_name ||
                      "Service"}
                  </strong>

                )}

              </div>

              {/* STATUS */}

              <div className="order-status-area">

                <select
                  className={statusClass(
                    order.status
                  )}
                  value={
                    order.status ||
                    "pending"
                  }
                  onChange={(e) =>
                    updateStatus(
                      order,
                      e.target.value
                    )
                  }
                >

                  <option value="pending">
                    Pending
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

              {/* TOTAL */}

              <div className="order-total">

                <span>
                  Total
                </span>

                <strong>
                  $
                  {Number(
                    order.total || 0
                  ).toFixed(2)}
                </strong>

              </div>

              {/* ACTIONS */}

              <div className="order-actions">

                <button
                  className="icon-button"
                  title="Edit Order"
                  onClick={() =>
                    openEditOrder(
                      order
                    )
                  }
                >
                  <Pencil size={16} />
                </button>

                <button
                  className="icon-button danger"
                  title="Delete Order"
                  onClick={() =>
                    deleteOrder(
                      order
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>

              </div>

            </div>

          )
        )
      )}

      {/* =================================================
          CREATE / EDIT MODAL
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
            onSubmit={saveOrder}
          >

            {/* HEADER */}

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
                    services to this order.
                  </p>

                </div>

              </div>

              <button
                type="button"
                className="order-modal-close"
                onClick={closeModal}
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    customer_id:
                      e.target.value,
                  })
                }
              >

                <option value="">
                  Select customer
                </option>

                {customers.map(
                  (customer) => (

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

            {/* CUSTOMER TYPE */}

            {selectedCustomer && (

              <div className="order-customer-type">

                {selectedCustomer.customer_type ===
                "monthly"
                  ? "Monthly Customer"
                  : "One-time Customer"}

              </div>

            )}

            {/* =================================================
                SERVICES
            ================================================= */}

            <div className="order-services-section">

              <div className="order-services-header">

                <div>

                  <label>
                    Services{" "}
                    <span>*</span>
                  </label>

                  <p>
                    Add as many services as
                    this order needs.
                  </p>

                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={addService}
                >
                  <Plus size={16} />
                  Add Service
                </button>

              </div>

              {/* SERVICE ITEMS */}

              {form.services.map(
                (item, index) => {

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
                      key={index}
                    >

                      {/* ITEM HEADER */}

                      <div className="order-service-item-header">

                        <strong>
                          Service{" "}
                          {index + 1}
                        </strong>

                        {form.services.length >
                          1 && (

                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() =>
                              removeService(
                                index
                              )
                            }
                            title="Remove Service"
                          >
                            <Trash2
                              size={15}
                            />
                          </button>

                        )}

                      </div>

                      {/* SERVICE */}

                      <div className="order-form-field">

                        <label>
                          Service{" "}
                          <span>*</span>
                        </label>

                        <select
                          required
                          value={
                            item.service_id
                          }
                          onChange={(e) =>
                            updateService(
                              index,
                              "service_id",
                              e.target.value
                            )
                          }
                        >

                          <option value="">
                            Select service
                          </option>

                          {services.map(
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
                                } — $
                                {Number(
                                  serviceOption.price ||
                                    0
                                ).toFixed(2)}
                              </option>

                            )
                          )}

                        </select>

                      </div>

                      {/* QUANTITY + DATE */}

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
                            onChange={(e) =>
                              updateService(
                                index,
                                "quantity",
                                e.target.value
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
                                left: "12px",
                                top: "50%",
                                transform:
                                  "translateY(-50%)",
                                pointerEvents:
                                  "none",
                              }}
                            />

                            <input
                              type="date"
                              required
                              value={
                                item.approved_date
                              }
                              onChange={(e) =>
                                updateService(
                                  index,
                                  "approved_date",
                                  e.target.value
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

                      {/* FILE */}

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
                              gap: "10px",
                              cursor:
                                "pointer",
                            }}
                          >

                            <Upload
                              size={18}
                            />

                            <span>

                              {item.file
                                ? item.file.name
                                : item.existing_file_name
                                ? item.existing_file_name
                                : "Choose a file"}

                            </span>

                            <input
                              type="file"
                              onChange={(e) =>
                                handleFileChange(
                                  index,
                                  e.target
                                    .files?.[0]
                                )
                              }
                              style={{
                                display:
                                  "none",
                              }}
                            />

                          </label>

                          {item.existing_file_name &&
                            !item.file && (

                            <small>
                              Existing file:{" "}
                              {
                                item.existing_file_name
                              }
                            </small>

                          )}

                        </div>

                      )}

                      {/* ITEM NOTES */}

                      <div className="order-form-field">

                        <label>
                          Service Notes
                        </label>

                        <textarea
                          placeholder="Notes for this service..."
                          value={
                            item.notes
                          }
                          onChange={(e) =>
                            updateService(
                              index,
                              "notes",
                              e.target.value
                            )
                          }
                        />

                      </div>

                      {/* ITEM TOTAL */}

                      <div className="order-service-item-total">

                        <span>
                          Service Total
                        </span>

                        <strong>
                          $
                          {itemTotal.toFixed(
                            2
                          )}
                        </strong>

                      </div>

                    </div>

                  );
                }
              )}

            </div>

            {/* =================================================
                ORDER TOTAL
            ================================================= */}

            <div className="order-price-summary">

              <div className="order-price-box">

                <span>
                  Services
                </span>

                <strong>
                  {form.services.length}
                </strong>

              </div>

              <div className="order-price-box total">

                <span>
                  Order Total
                </span>

                <strong>
                  $
                  {orderTotal.toFixed(
                    2
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    status:
                      e.target.value,
                  })
                }
              >

                <option value="pending">
                  Pending
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

            {/* ORDER NOTES */}

            <div className="order-form-field">

              <label>
                Order Notes
              </label>

              <textarea
                placeholder="Optional notes for the whole order..."
                value={
                  form.notes
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    notes:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* ACTIONS */}

            <div className="order-form-actions">

              <button
                type="button"
                className="order-cancel-button"
                onClick={closeModal}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="order-create-button"
                disabled={saving}
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
                      <Save size={17} />
                    ) : (
                      <Plus size={17} />
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