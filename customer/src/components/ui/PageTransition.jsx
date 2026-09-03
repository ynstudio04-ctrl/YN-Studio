import { useEffect, useState } from "react";

function PageTransition({ children }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`page-transition ${visible ? "page-visible" : ""}`}>
      {children}
    </div>
  );
}

export default PageTransition;