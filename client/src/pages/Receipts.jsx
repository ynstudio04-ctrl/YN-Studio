import { useEffect, useMemo, useState } from "react";

import {
  Receipt,
  Search,
  User,
  ShoppingBag,
  FileText,
  Download,
  Eye,
  X,
  Check,
  RefreshCw,
  ChevronDown,
  Package,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import "./Receipts.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* =========================================================
   HELPERS
========================================================= */

function getCustomerId(customer) {
  return (
    customer?.id ??
    customer?.customer_id ??
    customer?.customerId
  );
}

function getCustomerName(customer) {
  if (!customer) return "Unknown Customer";

  return (
    customer.full_name ||
    customer.name ||
    customer.customer_name ||
    `${customer.first_name || ""} ${
      customer.last_name || ""
    }`.trim() ||
    "Unknown Customer"
  );
}

function getCustomerCode(customer) {
  return (
    customer?.customer_code ||
    customer?.code ||
    customer?.customerCode ||
    "YN-000000"
  );
}

function getOrderId(order) {
  return (
    order?.id ??
    order?.order_id ??
    order?.orderId
  );
}

function getOrderNumber(order) {
  return (
    order?.public_order_number ||
    order?.order_number ||
    order?.orderNumber ||
    order?.code ||
    `ORD-${String(
      getOrderId(order) || 0
    ).padStart(6, "0")}`
  );
}

function getOrderCustomerId(order) {
  return (
    order?.customer_id ??
    order?.customerId
  );
}

/* =========================================================
   SERVICE HELPER
========================================================= */

function getService(order, services = []) {
  if (!order) return "Service";

  /*
   * First try the service name already attached
   * to the order.
   */
  const directName =
    order?.service_name ||
    order?.service ||
    order?.service_title ||
    order?.serviceName;

  if (
    directName &&
    directName !== "Service"
  ) {
    return directName;
  }

  /*
   * If the order only has service_id,
   * find the matching service from /services.
   */
  const serviceId =
    order?.service_id ??
    order?.serviceId;

  if (
    serviceId !== undefined &&
    serviceId !== null &&
    Array.isArray(services)
  ) {
    const foundService = services.find(
      (service) =>
        String(
          service?.id ??
          service?.service_id ??
          service?.serviceId
        ) === String(serviceId)
    );

    if (foundService) {
      return (
        foundService.name ||
        foundService.service_name ||
        foundService.title ||
        foundService.service_title ||
        foundService.serviceName ||
        "Service"
      );
    }
  }

  return "Service";
}

function getTotal(order) {
  const value =
    order?.total ??
    order?.price ??
    order?.amount ??
    0;

  return Number(value) || 0;
}

function parseReceiptDate(raw) {
  if (!raw) return null;

  const value = String(raw).trim();
  const datePart = value.match(/^(\d{4}-\d{2}-\d{2})/);

  if (datePart) {
    const [year, month, day] = datePart[1].split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    if (!Number.isNaN(localDate.getTime())) return localDate;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReceiptDate(raw) {
  const date = parseReceiptDate(raw);
  if (!date) return raw ? String(raw) : "—";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatReceiptMonth(raw) {
  const date = parseReceiptDate(raw) || new Date();
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

function getOrderDate(order) {
  return formatReceiptDate(
    order?.created_at ||
    order?.createdAt ||
    order?.date ||
    order?.order_date
  );
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

/* =========================================================
   ORDER ITEMS
========================================================= */

function getOrderItems(order) {
  if (!order) return [];

  if (
    Array.isArray(order.items) &&
    order.items.length
  ) {
    return order.items;
  }

  if (
    Array.isArray(order.order_items) &&
    order.order_items.length
  ) {
    return order.order_items;
  }

  if (
    Array.isArray(order.services) &&
    order.services.length
  ) {
    return order.services;
  }

  return [
    {
      id: order.id,

      service_id:
        order.service_id,

      service_name:
        order.service_name ||
        order.service ||
        order.service_title ||
        "Service",

      quantity:
        Number(order.quantity) || 1,

      price:
        Number(order.price) || 0,

      total:
        Number(order.total) || 0,

      approved_date:
        order.approved_date ||
        order.updated_at ||
        order.created_at,

      file_name:
        order.file_name ||
        null,

      file_type:
        order.file_type ||
        null,

      file_size:
        order.file_size ||
        0,

      file_data:
        order.file_data ||
        null,
    },
  ];
}

/* =========================================================
   ITEM SERVICE NAME
========================================================= */

function getItemServiceName(
  item,
  services = []
) {
  if (!item) return "Service";

  /*
   * First try the name already attached
   * to the order item.
   */
  const directName =
    item?.service_name ||
    item?.service ||
    item?.service_title ||
    item?.serviceName;

  if (
    directName &&
    directName !== "Service"
  ) {
    return directName;
  }

  /*
   * Otherwise use service_id to find
   * the actual service.
   */
  const serviceId =
    item?.service_id ??
    item?.serviceId;

  if (
    serviceId !== undefined &&
    serviceId !== null &&
    Array.isArray(services)
  ) {
    const foundService = services.find(
      (service) =>
        String(
          service?.id ??
          service?.service_id ??
          service?.serviceId
        ) === String(serviceId)
    );

    if (foundService) {
      return (
        foundService.name ||
        foundService.service_name ||
        foundService.title ||
        foundService.service_title ||
        foundService.serviceName ||
        "Service"
      );
    }
  }

  return "Service";
}

function getItemFileName(item) {
  return (
    item?.file_name ||
    item?.filename ||
    item?.fileName ||
    "No file"
  );
}

function getItemFileType(item) {
  return (
    item?.file_type ||
    item?.mime_type ||
    item?.fileType ||
    ""
  ).toLowerCase();
}

function getFileSrc(item) {
  if (!item?.file_data) {
    return null;
  }

  const data = String(
    item.file_data
  );

  if (data.startsWith("data:")) {
    return data;
  }

  const type =
    getItemFileType(item) ||
    "application/octet-stream";

  return `data:${type};base64,${data}`;
}

async function getPdfImageDataUrl(item) {
  const src = getFileSrc(item);
  if (!src) return null;

  // Already a data URL (legacy files or previously embedded data).
  if (src.startsWith("data:")) return src;

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(
        typeof reader.result === "string" ? reader.result : null
      );
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("PDF FILE FETCH FAILED:", error);
    return null;
  }
}

function isImageFile(item) {
  const type =
    getItemFileType(item);

  if (type.startsWith("image/")) {
    return true;
  }

  const filename =
    getItemFileName(item).toLowerCase();

  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(
    filename
  );
}

function getItemApprovedDate(
  item,
  order
) {
  const raw =
    item?.approved_date ||
    item?.approved_at ||
    order?.approved_date ||
    order?.approved_at ||
    order?.updated_at ||
    order?.created_at;

  if (!raw) return "—";

  return formatReceiptDate(raw);
}

/* =========================================================
   COMPONENT
========================================================= */

function Receipts() {
  const [customers, setCustomers] =
    useState([]);

  const [orders, setOrders] =
    useState([]);

  const [services, setServices] =
    useState([]);

  const [selectedCustomer, setSelectedCustomer] =
    useState("");

  const [selectedOrder, setSelectedOrder] =
    useState("");

  const [selectedOrders, setSelectedOrders] =
    useState([]);

  const [receiptType, setReceiptType] =
    useState("normal");

  const [searchCustomer, setSearchCustomer] =
    useState("");

  const [searchOrder, setSearchOrder] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [generating, setGenerating] =
    useState(false);

  const [showCustomerMenu, setShowCustomerMenu] =
    useState(false);

  const [showOrderMenu, setShowOrderMenu] =
    useState(false);

  const [showPreview, setShowPreview] =
    useState(false);

  const [receipt, setReceipt] =
    useState(null);

  const [notes, setNotes] =
    useState("");

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const token =
        localStorage.getItem(
          "yn_token"
        );

      const headers = {
        "Content-Type":
          "application/json",

        ...(token
          ? {
              Authorization:
                `Bearer ${token}`,
            }
          : {}),
      };

      const [
        customersResponse,
        ordersResponse,
        servicesResponse,
      ] = await Promise.all([
        fetch(
          `${API_URL}/customers`,
          { headers }
        ),

        fetch(
          `${API_URL}/orders`,
          { headers }
        ),

        fetch(
          `${API_URL}/services`,
          { headers }
        ),
      ]);

      if (!customersResponse.ok) {
        throw new Error(
          `Customers request failed: ${customersResponse.status}`
        );
      }

      if (!ordersResponse.ok) {
        throw new Error(
          `Orders request failed: ${ordersResponse.status}`
        );
      }

      if (!servicesResponse.ok) {
        throw new Error(
          `Services request failed: ${servicesResponse.status}`
        );
      }

      const customersData =
        await customersResponse.json();

      const ordersData =
        await ordersResponse.json();

      const servicesData =
        await servicesResponse.json();

      setCustomers(
        Array.isArray(customersData)
          ? customersData
          : customersData.customers ||
              []
      );

      setOrders(
        Array.isArray(ordersData)
          ? ordersData
          : ordersData.orders ||
              []
      );

      setServices(
        Array.isArray(servicesData)
          ? servicesData
          : servicesData.services ||
              []
      );
    } catch (error) {
      console.error(
        "RECEIPTS LOAD ERROR:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     CUSTOMER
  ========================================================= */

  const customer = useMemo(() => {
    return customers.find(
      (item) =>
        String(
          getCustomerId(item)
        ) ===
        String(selectedCustomer)
    );
  }, [
    customers,
    selectedCustomer,
  ]);

  const filteredCustomers =
    useMemo(() => {
      const search =
        searchCustomer
          .trim()
          .toLowerCase();

      if (!search) {
        return customers;
      }

      return customers.filter(
        (item) => {
          const name =
            getCustomerName(item)
              .toLowerCase();

          const code =
            getCustomerCode(item)
              .toLowerCase();

          return (
            name.includes(search) ||
            code.includes(search)
          );
        }
      );
    }, [
      customers,
      searchCustomer,
    ]);

  /* =========================================================
     ORDERS
  ========================================================= */

  const customerOrders =
    useMemo(() => {
      if (!selectedCustomer) {
        return [];
      }

      return orders.filter(
        (item) =>
          String(
            getOrderCustomerId(item)
          ) ===
          String(selectedCustomer)
      );
    }, [
      orders,
      selectedCustomer,
    ]);

  const filteredOrders =
    useMemo(() => {
      const search =
        searchOrder
          .trim()
          .toLowerCase();

      if (!search) {
        return customerOrders;
      }

      return customerOrders.filter(
        (item) => {
          const number =
            getOrderNumber(item)
              .toLowerCase();

          const service =
            getService(
              item,
              services
            ).toLowerCase();

          return (
            number.includes(search) ||
            service.includes(search)
          );
        }
      );
    }, [
      customerOrders,
      searchOrder,
      services,
    ]);

  const order = useMemo(() => {
    return orders.find(
      (item) =>
        String(
          getOrderId(item)
        ) ===
        String(selectedOrder)
    );
  }, [
    orders,
    selectedOrder,
  ]);

  /* =========================================================
     SELECT CUSTOMER
  ========================================================= */

  function handleCustomerSelect(
    item
  ) {
    const id =
      getCustomerId(item);

    setSelectedCustomer(id);
    setSelectedOrder("");
    setSelectedOrders([]);

    setSearchCustomer("");
    setSearchOrder("");

    setReceipt(null);
    setShowPreview(false);

    setShowCustomerMenu(false);
  }

  /* =========================================================
     SELECT ORDER
  ========================================================= */

  function handleOrderSelect(item) {
    const id = getOrderId(item);

    if (receiptType === "monthly") {
      setSelectedOrders((current) => {
        const exists = current.some((value) => String(value) === String(id));
        const next = exists
          ? current.filter((value) => String(value) !== String(id))
          : [...current, id];

        return next;
      });
      setSelectedOrder(id);
    } else {
      setSelectedOrder(id);
      setSelectedOrders([id]);
      setShowOrderMenu(false);
    }

    setNotes(item?.notes || item?.order_notes || "");
    setSearchOrder("");
    setReceipt(null);
    setShowPreview(false);
  }

  function isOrderSelected(id) {
    return selectedOrders.some((value) => String(value) === String(id));
  }

  function handleReceiptTypeChange(type) {
    setReceiptType(type);
    setReceipt(null);
    setShowPreview(false);
    if (type === "monthly") {
      setSelectedOrder("");
      setSelectedOrders([]);
    } else {
      setSelectedOrders(selectedOrder ? [selectedOrder] : []);
    }
  }

  /* =========================================================
     GET COMPLETE ORDER
  ========================================================= */

  async function getCompleteOrder(
    selected
  ) {
    const id =
      getOrderId(selected);

    if (!id) {
      return selected;
    }

    try {
      const token =
        localStorage.getItem(
          "yn_token"
        );

      const response =
        await fetch(
          `${API_URL}/orders/${id}`,
          {
            headers: {
              "Content-Type":
                "application/json",

              ...(token
                ? {
                    Authorization:
                      `Bearer ${token}`,
                  }
                : {}),
            },
          }
        );

      if (response.ok) {
        const data =
          await response.json();

        const complete =
          data.order ||
          data;

        if (complete) {
          return {
            ...selected,
            ...complete,
          };
        }
      }
    } catch (error) {
      console.warn(
        "COMPLETE ORDER FETCH FAILED:",
        error
      );
    }

    return selected;
  }

  /* =========================================================
     GENERATE
  ========================================================= */

  async function generateReceipt() {
    if (!customer) {
      alert(
        "Please select a customer first."
      );

      return;
    }

    const ids = receiptType === "monthly"
      ? selectedOrders
      : (selectedOrder ? [selectedOrder] : []);

    if (!ids.length) {
      alert(
        receiptType === "monthly"
          ? "Please select at least one order for the monthly receipt."
          : "Please select an order first."
      );
      return;
    }

    setGenerating(true);

    try {
      const completeOrders = [];
      // Fetch one order at a time. This keeps receipt generation lightweight.
      for (const id of ids) {
        const selected = orders.find(
          (item) => String(getOrderId(item)) === String(id)
        );
        if (selected) {
          completeOrders.push(await getCompleteOrder(selected));
        }
      }

      if (!completeOrders.length) {
        throw new Error("The selected orders could not be loaded.");
      }

      const primaryOrder = completeOrders[0];
      const items = completeOrders.flatMap((completeOrder) =>
        getOrderItems(completeOrder).map((item) => ({
          ...item,
          receipt_order: completeOrder,
          receipt_order_number: getOrderNumber(completeOrder),
          service_name: receiptType === "monthly"
            ? `${getOrderNumber(completeOrder)} • ${getItemServiceName(item, services)}`
            : getItemServiceName(item, services),
        }))
      );

      const total = completeOrders.reduce(
        (sum, completeOrder) => sum + getTotal(completeOrder),
        0
      );

      const dates = completeOrders
        .map((item) => getOrderDate(item))
        .filter(Boolean);

      const receiptNumber =
        `RCP-${Date.now()
          .toString()
          .slice(-8)}`;

      const generated = {
        id: receiptNumber,

        number:
          receiptNumber,

        type:
          receiptType,

        customer: {
          id:
            getCustomerId(
              customer
            ),

          name:
            getCustomerName(
              customer
            ),

          code:
            getCustomerCode(
              customer
            ),

          phone:
            customer?.phone ||
            customer?.phone_number ||
            "—",

          email:
            customer?.email ||
            "—",

          address:
            customer?.address ||
            "—",
        },

        order: {
          id: getOrderId(primaryOrder),
          ids: completeOrders.map((item) => getOrderId(item)),
          number: receiptType === "monthly"
            ? `${completeOrders.length} orders`
            : getOrderNumber(primaryOrder),
          items,
          total,
          date: receiptType === "monthly"
            ? formatReceiptMonth(dates[0] || new Date())
            : getOrderDate(primaryOrder),
          status: receiptType === "monthly"
            ? "monthly"
            : (primaryOrder?.status || "pending"),
          notes: notes || completeOrders.map((item) => item?.notes).filter(Boolean).join(" • "),
        },

        createdAt: new Date().toISOString(),
      };

      setReceipt(
        generated
      );

      setShowPreview(true);
    } catch (error) {
      console.error(
        "GENERATE RECEIPT ERROR:",
        error
      );

      alert(
        "Could not generate receipt."
      );
    } finally {
      setGenerating(false);
    }
  }

  /* =========================================================
     PDF
  ========================================================= */

  async function downloadReceipt() {
    if (!receipt) return;

    try {
      const doc =
        new jsPDF({
          orientation:
            "portrait",

          unit: "mm",

          format: "a4",
        });

      const items =
        receipt.order.items ||
        [];

      /* -----------------------------------------
         HEADER
      ----------------------------------------- */

      doc.setFillColor(
        25,
        19,
        31
      );

      doc.rect(
        0,
        0,
        210,
        38,
        "F"
      );

      doc.setTextColor(
        255,
        255,
        255
      );

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(21);

      doc.text(
        "YN STUDIO",
        14,
        17
      );

      doc.setFontSize(10);

      doc.setTextColor(
        201,
        167,
        255
      );

      doc.text(
        `${receipt.type.toUpperCase()} RECEIPT`,
        14,
        25
      );

      doc.setTextColor(
        255,
        255,
        255
      );

      doc.setFontSize(9);

      doc.text(
        receipt.number,
        196,
        17,
        {
          align: "right",
        }
      );

      /* -----------------------------------------
         ORDER INFORMATION
      ----------------------------------------- */

      doc.setTextColor(
        35,
        29,
        43
      );

      doc.setFontSize(9);

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.text(
        "CUSTOMER",
        14,
        51
      );

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(12);

      doc.text(
        receipt.customer.name,
        14,
        58
      );

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setFontSize(9);

      doc.text(
        receipt.customer.code,
        14,
        64
      );

      doc.text(
        "ORDER",
        115,
        51
      );

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(12);

      doc.text(
        receipt.order.number,
        115,
        58
      );

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setFontSize(9);

      doc.text(
        `Order date: ${receipt.order.date}`,
        115,
        64
      );

      /* -----------------------------------------
         TABLE
      ----------------------------------------- */

      // Fetch actual image files only when the user downloads the PDF.
      // The receipt preview/order list never downloads these files.
      const pdfItems = await Promise.all(
        items.map(async (item) => ({
          ...item,
          _pdfImageDataUrl: isImageFile(item)
            ? await getPdfImageDataUrl(item)
            : null,
        }))
      );

      const pdfRows = pdfItems.map((item, index) => [
        String(index + 1).padStart(2, "0"),
        getItemServiceName(item, services),
        getItemFileName(item),
        getItemApprovedDate(
          item,
          item.receipt_order || receipt.order
        ),
      ]);

      autoTable(
        doc,
        {
          startY: 74,

          head: [
            [
              "#",
              "SERVICE",
              "FILE",
              "APPROVED DATE",
            ],
          ],

          body:
            pdfRows.length
              ? pdfRows
              : [
                  [
                    "01",
                    "Service",
                    "No file",
                    "—",
                  ],
                ],

          theme: "grid",

          styles: {
            font:
              "helvetica",

            fontSize: 8.5,

            textColor: [
              45,
              40,
              50,
            ],

            cellPadding: 4,

            valign:
              "middle",

            lineColor: [
              225,
              218,
              232,
            ],

            lineWidth:
              0.2,
          },

          headStyles: {
            fillColor: [
              243,
              238,
              251,
            ],

            textColor: [
              90,
              70,
              110,
            ],

            fontStyle:
              "bold",

            fontSize: 8,

            halign:
              "left",
          },

          columnStyles: {
            0: {
              cellWidth: 13,
            },

            1: {
              cellWidth: 58,
            },

            2: {
              cellWidth: 70,
            },

            3: {
              cellWidth: 45,
            },
          },

          didDrawCell:
            (data) => {
              if (
                data.section !==
                "body"
              ) {
                return;
              }

              if (
                data.column.index !==
                2
              ) {
                return;
              }

              const item =
                pdfItems[
                  data.row.index
                ];

              if (!item) {
                return;
              }

              if (
                !isImageFile(
                  item
                )
              ) {
                return;
              }

              const src =
                item._pdfImageDataUrl ||
                getFileSrc(item);

              if (!src) {
                return;
              }

              try {
                const type =
                  getItemFileType(
                    item
                  );

                let format =
                  "JPEG";

                if (
                  type.includes(
                    "png"
                  )
                ) {
                  format =
                    "PNG";
                }

                const imageWidth =
                  18;

                const imageHeight =
                  13;

                doc.addImage(
                  src,
                  format,
                  data.cell.x + 2,
                  data.cell.y + 2,
                  imageWidth,
                  imageHeight
                );
              } catch (
                imageError
              ) {
                console.warn(
                  "PDF IMAGE ERROR:",
                  imageError
                );
              }
            },

          didParseCell:
            (data) => {
              if (
                data.section ===
                  "body" &&
                data.column.index ===
                  2
              ) {
                const item =
                  pdfItems[
                    data.row.index
                  ];

                if (
                  item &&
                  isImageFile(
                    item
                  )
                ) {
                  data.cell.minHeight =
                    20;

                  data.cell.styles
                    .cellPadding = {
                    top: 3,
                    right: 3,
                    bottom: 3,
                    left: 23,
                  };
                }
              }
            },
        }
      );

      /* -----------------------------------------
         TOTAL
      ----------------------------------------- */

      let finalY =
        doc.lastAutoTable
          .finalY + 12;

      if (
        finalY > 270
      ) {
        doc.addPage();

        finalY = 20;
      }

      doc.setDrawColor(
        40,
        32,
        48
      );

      doc.setLineWidth(
        0.5
      );

      doc.line(
        14,
        finalY,
        196,
        finalY
      );

      finalY += 9;

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(11);

      doc.setTextColor(
        40,
        32,
        48
      );

      doc.text(
        "TOTAL",
        145,
        finalY
      );

      doc.setFontSize(15);

      doc.text(
        formatMoney(
          receipt.order.total
        ),
        196,
        finalY,
        {
          align:
            "right",
        }
      );

      /* -----------------------------------------
         NOTES
      ----------------------------------------- */

      if (
        receipt.order.notes
      ) {
        finalY += 15;

        doc.setFontSize(8);

        doc.setFont(
          "helvetica",
          "bold"
        );

        doc.text(
          "NOTES",
          14,
          finalY
        );

        finalY += 5;

        doc.setFont(
          "helvetica",
          "normal"
        );

        const noteLines =
          doc.splitTextToSize(
            receipt.order.notes,
            180
          );

        doc.text(
          noteLines,
          14,
          finalY
        );

        finalY +=
          noteLines.length *
          4;
      }

      /* -----------------------------------------
         FOOTER
      ----------------------------------------- */

      doc.setFontSize(8);

      doc.setFont(
        "helvetica",
        "normal"
      );

      doc.setTextColor(
        120,
        110,
        125
      );

      doc.text(
        "Thank you for choosing YN Studio.",
        105,
        288,
        {
          align:
            "center",
        }
      );

      /* -----------------------------------------
         SAVE
      ----------------------------------------- */

      const reportMonth = formatReceiptMonth(receipt.createdAt || new Date());
      const safeCustomerName = String(receipt.customer.name || "Customer")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      doc.save(
        `${reportMonth} reports for ${safeCustomerName || "Customer"}.pdf`
      );
    } catch (error) {
      console.error(
        "PDF GENERATION ERROR:",
        error
      );

      alert(
        "Unable to create the PDF. Please check the console for details."
      );
    }
  }

  /* =========================================================
     RESET
  ========================================================= */

  function resetForm() {
    setSelectedCustomer("");
    setSelectedOrder("");

    setSearchCustomer("");
    setSearchOrder("");

    setReceipt(null);
    setNotes("");

    setShowPreview(false);
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="receipts-page">

      {/* HEADER */}

      <div className="receipts-header">

        <div className="receipts-heading">

          <div className="receipts-heading-icon">
            <Receipt size={24} />
          </div>

          <div>
            <div className="receipts-eyebrow">
              DOCUMENT CENTER
            </div>

            <h1>
              Receipts
            </h1>

            <p>
              Create professional
              PDF receipts from
              existing orders.
            </p>
          </div>

        </div>

        <button
          className="refresh-button"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={
              loading
                ? "spin"
                : ""
            }
          />

          Refresh
        </button>

      </div>

      {/* MAIN */}

      <div className="receipts-layout">

        {/* LEFT */}

        <section className="receipt-builder">

          <div className="section-heading">

            <div>
              <span>
                STEP 01
              </span>

              <h2>
                Receipt details
              </h2>
            </div>

            <FileText size={20} />

          </div>

          {/* RECEIPT TYPE */}

          <div className="field-block">

            <label>
              Receipt type
            </label>

            <div className="receipt-types">

              {[
                {
                  id: "normal",
                  title: "Normal",
                  description:
                    "Standard order receipt",
                },

                {
                  id: "monthly",
                  title: "Monthly",
                  description:
                    "Monthly customer record",
                },

                {
                  id: "express",
                  title: "Express",
                  description:
                    "Quick payment receipt",
                },
              ].map(
                (type) => (
                  <button
                    key={
                      type.id
                    }
                    className={
                      receiptType ===
                      type.id
                        ? "receipt-type active"
                        : "receipt-type"
                    }
                    onClick={() =>
                      handleReceiptTypeChange(
                        type.id
                      )
                    }
                  >
                    <div className="type-check">
                      {receiptType ===
                        type.id && (
                        <Check
                          size={14}
                        />
                      )}
                    </div>

                    <div>
                      <strong>
                        {
                          type.title
                        }
                      </strong>

                      <span>
                        {
                          type.description
                        }
                      </span>
                    </div>
                  </button>
                )
              )}

            </div>

          </div>

          {/* CUSTOMER */}

          <div className="field-block">

            <label>
              Customer
            </label>

            <div className="custom-select">

              <button
                className="select-trigger"
                onClick={() =>
                  setShowCustomerMenu(
                    (value) =>
                      !value
                  )
                }
              >

                <div className="select-main">

                  <User
                    size={18}
                  />

                  <div>

                    <strong>
                      {customer
                        ? getCustomerName(
                            customer
                          )
                        : "Select customer"}
                    </strong>

                    <span>
                      {customer
                        ? getCustomerCode(
                            customer
                          )
                        : "Choose a customer"}
                    </span>

                  </div>

                </div>

                <ChevronDown
                  size={18}
                />

              </button>

              {showCustomerMenu && (
                <div className="select-menu">

                  <div className="menu-search">

                    <Search
                      size={16}
                    />

                    <input
                      value={
                        searchCustomer
                      }
                      onChange={(
                        event
                      ) =>
                        setSearchCustomer(
                          event.target
                            .value
                        )
                      }
                      placeholder="Search customer..."
                      autoFocus
                    />

                  </div>

                  <div className="menu-list">

                    {filteredCustomers
                      .length ===
                    0 ? (
                      <div className="empty-menu">
                        No customers found.
                      </div>
                    ) : (
                      filteredCustomers.map(
                        (item) => (
                          <button
                            key={String(
                              getCustomerId(
                                item
                              )
                            )}
                            className="menu-item"
                            onClick={() =>
                              handleCustomerSelect(
                                item
                              )
                            }
                          >

                            <div className="menu-item-icon">
                              <User
                                size={16}
                              />
                            </div>

                            <div>
                              <strong>
                                {getCustomerName(
                                  item
                                )}
                              </strong>

                              <span>
                                {getCustomerCode(
                                  item
                                )}
                              </span>
                            </div>

                          </button>
                        )
                      )
                    )}

                  </div>

                </div>
              )}

            </div>

          </div>

          {/* ORDER */}

          <div className="field-block">

            <label>
              Order
            </label>

            <div
              className={
                selectedCustomer
                  ? "custom-select"
                  : "custom-select disabled"
              }
            >

              <button
                className="select-trigger"
                disabled={
                  !selectedCustomer
                }
                onClick={() =>
                  setShowOrderMenu(
                    (value) =>
                      !value
                  )
                }
              >

                <div className="select-main">

                  <ShoppingBag
                    size={18}
                  />

                  <div>

                    <strong>
                      {receiptType === "monthly"
                        ? (selectedOrders.length ? `${selectedOrders.length} orders selected` : "Select orders")
                        : (order ? getOrderNumber(order) : "Select order")}
                    </strong>

                    <span>
                      {receiptType === "monthly"
                        ? (selectedCustomer ? "Choose one or more orders" : "Select customer first")
                        : (order ? getService(order, services) : selectedCustomer ? "Choose an order" : "Select customer first")}
                    </span>

                  </div>

                </div>

                <ChevronDown
                  size={18}
                />

              </button>

              {showOrderMenu &&
                selectedCustomer && (
                  <div className="select-menu">

                    <div className="menu-search">

                      <Search
                        size={16}
                      />

                      <input
                        value={
                          searchOrder
                        }
                        onChange={(
                          event
                        ) =>
                          setSearchOrder(
                            event.target
                              .value
                          )
                        }
                        placeholder="Search order..."
                        autoFocus
                      />

                    </div>

                    <div className="menu-list">

                      {filteredOrders
                        .length ===
                      0 ? (
                        <div className="empty-menu">
                          No orders found.
                        </div>
                      ) : (
                        filteredOrders.map(
                          (item) => (
                            <button
                              key={String(
                                getOrderId(
                                  item
                                )
                              )}
                              className="menu-item"
                              onClick={() =>
                                handleOrderSelect(
                                  item
                                )
                              }
                            >

                              <div className="menu-item-icon">
                                {receiptType === "monthly" ? (
                                  <input
                                    type="checkbox"
                                    checked={isOrderSelected(getOrderId(item))}
                                    onChange={() => handleOrderSelect(item)}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                ) : (
                                  <ShoppingBag size={16} />
                                )}
                              </div>

                              <div>
                                <strong>
                                  {getOrderNumber(
                                    item
                                  )}
                                </strong>

                                <span>
                                  {getService(
                                    item,
                                    services
                                  )}
                                </span>
                              </div>

                            </button>
                          )
                        )
                      )}

                    </div>

                  </div>
                )}

            </div>

          </div>

          {/* ORDER INFORMATION */}

          {(order || (receiptType === "monthly" && selectedOrders.length > 0)) && (
            <div className="selected-order-card">

              <div className="selected-order-icon">
                <Package
                  size={21}
                />
              </div>

              <div className="selected-order-info">

                <span>
                  {receiptType === "monthly" ? "SELECTED ORDERS" : "SELECTED ORDER"}
                </span>

                <strong>
                  {receiptType === "monthly"
                    ? `${selectedOrders.length} order${selectedOrders.length === 1 ? "" : "s"}`
                    : getOrderNumber(order)}
                </strong>

                <p>
                  {receiptType === "monthly"
                    ? "These orders will be combined into one monthly receipt."
                    : getService(order, services)}
                </p>

              </div>

              <div className="selected-order-total">

                <span>
                  TOTAL
                </span>

                <strong>
                  {formatMoney(
                    getTotal(
                      order
                    )
                  )}
                </strong>

              </div>

            </div>
          )}

          {/* NOTES */}

          <div className="field-block">

            <label>
              Notes
            </label>

            <textarea
              value={notes}
              onChange={(
                event
              ) =>
                setNotes(
                  event.target
                    .value
                )
              }
              placeholder="Optional receipt notes..."
              rows={4}
            />

          </div>

          {/* ACTIONS */}

          <div className="builder-actions">

            <button
              className="secondary-button"
              onClick={
                resetForm
              }
            >
              Reset
            </button>

            <button
              className="primary-button"
              onClick={
                generateReceipt
              }
              disabled={
                generating ||
                !customer ||
                !order
              }
            >
              {generating ? (
                <>
                  <RefreshCw
                    size={17}
                    className="spin"
                  />

                  Preparing...
                </>
              ) : (
                <>
                  <Receipt
                    size={17}
                  />

                  Generate Receipt
                </>
              )}
            </button>

          </div>

        </section>

        {/* RIGHT PREVIEW */}

        <section className="receipt-preview-section">

          <div className="preview-header">

            <div>
              <span>
                STEP 02
              </span>

              <h2>
                Receipt preview
              </h2>
            </div>

            {receipt && (
              <div className="preview-actions">

                <button
                  onClick={() =>
                    setShowPreview(
                      true
                    )
                  }
                  title="Preview receipt"
                >
                  <Eye
                    size={16}
                  />
                </button>

                <button
                  onClick={
                    downloadReceipt
                  }
                  title="Download PDF"
                >
                  <Download
                    size={16}
                  />
                </button>

              </div>
            )}

          </div>

          {!receipt ? (
            <div className="empty-preview">

              <div className="empty-preview-icon">
                <Receipt
                  size={35}
                />
              </div>

              <h3>
                No receipt yet
              </h3>

              <p>
                Select a customer
                and order, then
                generate a receipt.
              </p>

            </div>
          ) : (
            <div className="receipt-paper">

              {/* PAPER HEADER */}

              <div className="paper-header">

                <div>
                  <div className="paper-brand">
                    YN STUDIO
                  </div>

                  <div className="paper-title">
                    {receipt.type}
                    {" "}
                    RECEIPT
                  </div>
                </div>

                <div className="paper-number">

                  <span>
                    RECEIPT
                  </span>

                  <strong>
                    {receipt.number}
                  </strong>

                </div>

              </div>

              {/* CUSTOMER / ORDER */}

              <div className="paper-info-grid">

                <div>

                  <span>
                    CUSTOMER
                  </span>

                  <strong>
                    {receipt.customer.name}
                  </strong>

                  <small>
                    {receipt.customer.code}
                  </small>

                </div>

                <div>

                  <span>
                    ORDER
                  </span>

                  <strong>
                    {receipt.order.number}
                  </strong>

                  <small>
                    {receipt.order.date}
                  </small>

                </div>

              </div>

              {/* TABLE */}

              <div className="receipt-table">

                <div className="receipt-table-head">

                  <div>
                    #
                  </div>

                  <div>
                    SERVICE
                  </div>

                  <div>
                    FILE
                  </div>

                  <div>
                    APPROVED
                  </div>

                </div>

                {receipt.order.items.map(
                  (
                    item,
                    index
                  ) => {

                    const fileSrc =
                      getFileSrc(
                        item
                      );

                    const image =
                      isImageFile(
                        item
                      ) &&
                      fileSrc;

                    return (
                      <div
                        className="receipt-table-row"
                        key={
                          item.id ||
                          `${index}-${getItemServiceName(
                            item,
                            services
                          )}`
                        }
                      >

                        <div className="row-number">
                          {String(
                            index + 1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </div>

                        <div className="row-service">

                          <strong>
                            {getItemServiceName(
                              item,
                              services
                            )}
                          </strong>

                        </div>

                        <div className="row-file">

                          {image ? (
                            <div className="image-file">

                              <img
                                src={
                                  image
                                }
                                alt={
                                  getItemFileName(
                                    item
                                  )
                                }
                              />

                              <span>
                                {getItemFileName(
                                  item
                                )}
                              </span>

                            </div>
                          ) : (
                            <div className="document-file">

                              <FileText
                                size={17}
                              />

                              <span>
                                {getItemFileName(
                                  item
                                )}
                              </span>

                            </div>
                          )}

                        </div>

                        <div className="row-date">

                          {getItemApprovedDate(
                            item,
                            item.receipt_order || receipt.order
                          )}

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

              {/* TOTAL */}

              <div className="paper-total">

                <span>
                  TOTAL
                </span>

                <strong>
                  {formatMoney(
                    receipt.order.total
                  )}
                </strong>

              </div>

              {/* NOTES */}

              {receipt.order.notes && (
                <div className="paper-notes">

                  <span>
                    NOTES
                  </span>

                  <p>
                    {receipt.order.notes}
                  </p>

                </div>
              )}

              {/* DOWNLOAD */}

              <button
                className="paper-download"
                onClick={
                  downloadReceipt
                }
              >
                <Download
                  size={17}
                />

                Download PDF
              </button>

            </div>
          )}

        </section>

      </div>

      {/* FULL PREVIEW */}

      {showPreview &&
        receipt && (
          <div
            className="receipt-modal-backdrop"
            onClick={() =>
              setShowPreview(
                false
              )
            }
          >

            <div
              className="receipt-modal"
              onClick={(
                event
              ) =>
                event.stopPropagation()
              }
            >

              <div className="modal-header">

                <div>
                  <span>
                    RECEIPT
                  </span>

                  <h2>
                    {receipt.number}
                  </h2>
                </div>

                <button
                  onClick={() =>
                    setShowPreview(
                      false
                    )
                  }
                >
                  <X
                    size={19}
                  />
                </button>

              </div>

              <div className="modal-body">

                <div className="modal-table">

                  <div className="modal-table-head">

                    <div>
                      #
                    </div>

                    <div>
                      SERVICE
                    </div>

                    <div>
                      FILE
                    </div>

                    <div>
                      APPROVED
                    </div>

                  </div>

                  {receipt.order.items.map(
                    (
                      item,
                      index
                    ) => {

                      return (
                        <div
                          className="modal-table-row"
                          key={
                            item.id ||
                            index
                          }
                        >

                          <div>
                            {String(
                              index + 1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <div>
                            <strong>
                              {getItemServiceName(
                                item,
                                services
                              )}
                            </strong>
                          </div>

                          <div>
                            <div className="modal-file">
                              <FileText size={17} />
                              <span>
                                {getItemFileName(item)}
                              </span>
                            </div>
                          </div>

                          <div>
                            {getItemApprovedDate(
                              item,
                              receipt.order
                            )}
                          </div>

                        </div>
                      );
                    }
                  )}

                </div>

                <div className="modal-total">

                  <span>
                    TOTAL
                  </span>

                  <strong>
                    {formatMoney(
                      receipt.order.total
                    )}
                  </strong>

                </div>

              </div>

              <div className="modal-footer">

                <button
                  className="modal-secondary"
                  onClick={() =>
                    setShowPreview(
                      false
                    )
                  }
                >
                  Close
                </button>

                <button
                  className="modal-primary"
                  onClick={
                    downloadReceipt
                  }
                >
                  <Download
                    size={17}
                  />

                  Download PDF
                </button>

              </div>

            </div>

          </div>
        )}

    </div>
  );
}

export default Receipts;