import { useEffect } from "react";
import { X } from "lucide-react";

function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "medium",
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`modal modal-${size}`}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>

            {description && (
              <p>{description}</p>
            )}
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;