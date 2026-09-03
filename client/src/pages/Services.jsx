
import { useEffect, useMemo, useState } from "react";

import {
  Search,
  Plus,
  BriefcaseBusiness,
  Pencil,
  Trash2,
  X,
  Check,
  Power,
  Upload,
} from "lucide-react";

import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Toast from "../components/ui/Toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const emptyForm = {
  name: "",
  category: "",
  price: "",
  description: "",
  active: 1,
  allow_file_upload: 0,
};

function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState(null);

  // =====================================================
  // LOAD SERVICES
  // =====================================================

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/services`);

      if (!response.ok) {
        throw new Error("Failed to load services");
      }

      const data = await response.json();
      setServices(data);
    } catch (error) {
      console.error(error);
      showToast("Failed to load services.", "error");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // TOAST
  // =====================================================

  function showToast(message, type = "success") {
    setToast({
      message,
      type,
    });

    setTimeout(() => {
      setToast(null);
    }, 3500);
  }

  // =====================================================
  // OPEN ADD
  // =====================================================

  function openAddModal() {
    setEditingService(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  // =====================================================
  // OPEN EDIT
  // =====================================================

  function openEditModal(service) {
    setEditingService(service);

    setForm({
      name: service.name || "",
      category: service.category || "",
      price:
        service.price !== null &&
        service.price !== undefined
          ? service.price
          : "",
      description: service.description || "",
      active: service.active === 0 ? 0 : 1,
      allow_file_upload:
        service.allow_file_upload === 1 ||
        service.allow_file_upload === true
          ? 1
          : 0,
    });

    setModalOpen(true);
  }

  // =====================================================
  // CLOSE MODAL
  // =====================================================

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingService(null);
    setForm({ ...emptyForm });
  }

  // =====================================================
  // UPDATE FIELD
  // =====================================================

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  // =====================================================
  // SAVE SERVICE
  // =====================================================

  async function saveService(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      showToast("Please enter a service name.", "error");
      return;
    }

    if (form.price === "" || Number(form.price) < 0) {
      showToast("Please enter a valid price.", "error");
      return;
    }

    try {
      setSaving(true);

      const url = editingService
        ? `${API_URL}/services/${editingService.id}`
        : `${API_URL}/services`;

      const method = editingService ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim(),
          price: Number(form.price),
          description: form.description.trim(),
          active: form.active ? 1 : 0,
          allow_file_upload: form.allow_file_upload ? 1 : 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save service");
      }

      if (editingService) {
        setServices((previous) =>
          previous.map((service) =>
            service.id === data.id ? data : service
          )
        );

        showToast("Service updated successfully.");
      } else {
        setServices((previous) => [data, ...previous]);

        showToast("Service created successfully.");
      }

      closeModal();
    } catch (error) {
      console.error(error);

      showToast(
        error.message || "Failed to save service.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // TOGGLE SERVICE
  // =====================================================

  async function toggleService(service) {
    try {
      const response = await fetch(
        `${API_URL}/services/${service.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: service.name,
            category: service.category || "",
            price: Number(service.price),
            description: service.description || "",
            active: service.active === 1 ? 0 : 1,
            allow_file_upload:
              service.allow_file_upload === 1 ||
              service.allow_file_upload === true
                ? 1
                : 0,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update service"
        );
      }

      setServices((previous) =>
        previous.map((item) =>
          item.id === data.id ? data : item
        )
      );

      showToast(
        data.active === 1
          ? "Service activated."
          : "Service disabled."
      );
    } catch (error) {
      console.error(error);

      showToast(
        error.message || "Failed to update service.",
        "error"
      );
    }
  }

  // =====================================================
  // DELETE SERVICE
  // =====================================================

  async function deleteService(service) {
    const confirmed = window.confirm(
      `Delete "${service.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/services/${service.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to delete service"
        );
      }

      setServices((previous) =>
        previous.filter(
          (item) => item.id !== service.id
        )
      );

      showToast("Service deleted successfully.");
    } catch (error) {
      console.error(error);

      showToast(
        error.message || "Failed to delete service.",
        "error"
      );
    }
  }

  // =====================================================
  // FILTER
  // =====================================================

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return services.filter((service) => {
      const matchesSearch =
        !query ||
        service.name?.toLowerCase().includes(query) ||
        service.category?.toLowerCase().includes(query) ||
        service.service_code?.toLowerCase().includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "active" && service.active === 1) ||
        (filter === "inactive" && service.active === 0);

      return matchesSearch && matchesFilter;
    });
  }, [services, search, filter]);

  const activeCount = services.filter(
    (service) => service.active === 1
  ).length;

  const inactiveCount = services.filter(
    (service) => service.active === 0
  ).length;

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="services-page">
      {/* HEADER */}

      <div className="services-header">
        <div>
          <div className="services-eyebrow">
            SERVICE MANAGEMENT
          </div>

          <h1>Services</h1>

          <p>
            Manage the services and prices you offer
            through YN Studio.
          </p>
        </div>

        <Button
          icon={<Plus size={17} />}
          onClick={openAddModal}
        >
          Add Service
        </Button>
      </div>

      {/* STATS */}

      <div className="service-stats">
        <div className="service-stat">
          <div className="service-stat-icon">
            <BriefcaseBusiness size={18} />
          </div>

          <div>
            <strong>{services.length}</strong>
            <span>Total Services</span>
          </div>
        </div>

        <div className="service-stat">
          <div className="service-stat-icon">
            <Check size={18} />
          </div>

          <div>
            <strong>{activeCount}</strong>
            <span>Active</span>
          </div>
        </div>

        <div className="service-stat">
          <div className="service-stat-icon">
            <Power size={18} />
          </div>

          <div>
            <strong>{inactiveCount}</strong>
            <span>Disabled</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}

      <div className="services-toolbar">
        <div className="service-search">
          <Search size={17} />

          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="service-filters">
          <button
            type="button"
            className={
              filter === "all"
                ? "service-filter active"
                : "service-filter"
            }
            onClick={() => setFilter("all")}
          >
            All
          </button>

          <button
            type="button"
            className={
              filter === "active"
                ? "service-filter active"
                : "service-filter"
            }
            onClick={() => setFilter("active")}
          >
            Active
          </button>

          <button
            type="button"
            className={
              filter === "inactive"
                ? "service-filter active"
                : "service-filter"
            }
            onClick={() => setFilter("inactive")}
          >
            Disabled
          </button>
        </div>
      </div>

      {/* SERVICE LIST */}

      {loading ? (
        <div className="services-empty">
          <div className="loading-spinner" />

          <h2>Loading services...</h2>

          <p>
            Please wait while your services are loaded.
          </p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="services-empty">
          <div className="services-empty-icon">
            <BriefcaseBusiness size={24} />
          </div>

          <h2>
            {services.length === 0
              ? "No services yet"
              : "No services found"}
          </h2>

          <p>
            {services.length === 0
              ? "Create your first service so you can use it later when creating orders and receipts."
              : "Try changing your search or filter."}
          </p>

          {services.length === 0 && (
            <Button
              icon={<Plus size={16} />}
              onClick={openAddModal}
            >
              Add Your First Service
            </Button>
          )}
        </div>
      ) : (
        <div className="services-grid">
          {filteredServices.map((service) => (
            <div
              className={
                service.active === 1
                  ? "service-card"
                  : "service-card inactive"
              }
              key={service.id}
            >
              {/* CARD TOP */}

              <div className="service-card-top">
                <div className="service-icon">
                  <BriefcaseBusiness size={19} />
                </div>

                <span
                  className={
                    service.active === 1
                      ? "service-status active"
                      : "service-status inactive"
                  }
                >
                  {service.active === 1
                    ? "Active"
                    : "Disabled"}
                </span>
              </div>

              {/* SERVICE INFO */}

              <div className="service-card-info">
                <h3>{service.name}</h3>

                {service.service_code && (
                  <span className="service-code">
                    {service.service_code}
                  </span>
                )}
              </div>

              {/* PRICE */}

              <div className="service-price">
                <span>Price</span>

                <strong>
                  ${Number(service.price).toFixed(2)}
                </strong>
              </div>

              {/* CATEGORY */}

              {service.category && (
                <div className="service-category">
                  {service.category}
                </div>
              )}

              {/* DESCRIPTION */}

              {service.description && (
                <p className="service-description">
                  {service.description}
                </p>
              )}

              {/* FILE UPLOAD */}

              <div className="service-file-status">
                <div className="service-file-status-icon">
                  <Upload size={14} />
                </div>

                <div>
                  <strong>File Upload</strong>

                  <span>
                    {service.allow_file_upload === 1 ||
                    service.allow_file_upload === true
                      ? "Enabled for orders"
                      : "Disabled for orders"}
                  </span>
                </div>
              </div>

              {/* ACTIONS */}

              <div className="service-card-actions">
                <button
                  type="button"
                  onClick={() =>
                    openEditModal(service)
                  }
                >
                  <Pencil size={14} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() =>
                    toggleService(service)
                  }
                >
                  <Power size={14} />

                  {service.active === 1
                    ? "Disable"
                    : "Activate"}
                </button>

                <button
                  type="button"
                  className="delete"
                  onClick={() =>
                    deleteService(service)
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD / EDIT MODAL */}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingService
            ? "Edit Service"
            : "Add Service"
        }
        description={
          editingService
            ? "Update this service and its pricing."
            : "Create a service that can later be used in orders and receipts."
        }
        size="medium"
      >
        <form
          className="service-form"
          onSubmit={saveService}
        >
          <div className="form-group">
            <label>Service Name</label>

            <input
              value={form.name}
              onChange={(event) =>
                updateField(
                  "name",
                  event.target.value
                )
              }
              placeholder="e.g. Graphic Design"
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>

              <input
                value={form.category}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value
                  )
                }
                placeholder="e.g. Design"
              />
            </div>

            <div className="form-group">
              <label>Price</label>

              <div className="price-input">
                <span>$</span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    updateField(
                      "price",
                      event.target.value
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>

            <textarea
              value={form.description}
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value
                )
              }
              placeholder="Describe what this service includes..."
              rows={4}
            />
          </div>

          <div className="service-option">
            <div className="service-option-icon">
              <Power size={17} />
            </div>

            <div className="service-option-content">
              <strong>Service Status</strong>

              <span>
                Disabled services won't appear
                when creating new orders.
              </span>
            </div>

            <button
              type="button"
              className={
                form.active
                  ? "toggle active"
                  : "toggle"
              }
              onClick={() =>
                updateField(
                  "active",
                  form.active ? 0 : 1
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="service-option">
            <div className="service-option-icon">
              <Upload size={17} />
            </div>

            <div className="service-option-content">
              <strong>File Upload</strong>

              <span>
                Allow files to be attached
                when creating orders.
              </span>
            </div>

            <button
              type="button"
              className={
                form.allow_file_upload
                  ? "toggle active"
                  : "toggle"
              }
              onClick={() =>
                updateField(
                  "allow_file_upload",
                  form.allow_file_upload
                    ? 0
                    : 1
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="service-form-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={closeModal}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={saving}
            >
              {editingService
                ? "Save Changes"
                : "Create Service"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* TOAST */}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default Services;

