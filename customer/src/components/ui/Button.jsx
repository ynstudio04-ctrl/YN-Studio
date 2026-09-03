import { Loader2 } from "lucide-react";

function Button({
  children,
  variant = "primary",
  loading = false,
  icon,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`ui-button ui-button-${variant} ${className}`}
    >
      {loading ? <Loader2 className="button-spinner" size={17} /> : icon}
      <span>{children}</span>
    </button>
  );
}

export default Button;