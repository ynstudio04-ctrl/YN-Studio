import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
} from "lucide-react";

function Toast({
  message,
  type = "success",
  onClose,
}) {
  const icons = {
    success: <CheckCircle2 size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-icon">
        {icons[type]}
      </div>

      <span>{message}</span>

      <button
        type="button"
        className="toast-close"
        onClick={onClose}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default Toast;