import { useEffect, useState } from 'react';

function isPhone() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 600;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android.*Mobile|iPhone|iPod/i.test(ua);
  return narrow && (coarse || mobileUA);
}

export default function PhoneOnlyGate({ children }) {
  const [allowed, setAllowed] = useState(isPhone);
  useEffect(() => {
    const update = () => setAllowed(isPhone());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
  }, []);
  if (allowed) return children;
  return (
    <main className="phone-only-gate">
      <div className="phone-only-card">
        <div className="phone-only-logo">YN</div>
        <h1>Phone only</h1>
        <p>The customer portal is available on a phone only. Open your private customer link on your iPhone or Android phone.</p>
      </div>
    </main>
  );
}
