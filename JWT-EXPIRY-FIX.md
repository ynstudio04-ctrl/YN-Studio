# JWT expiry fix

- New admin/customer JWTs are valid for 30 days instead of 7 days.
- The API now returns HTTP 401 for an actually expired JWT, making the client handle it as a session expiry rather than a generic forbidden response.
- Customer API requests clear the customer session on both 401 and 403.
- Existing already-expired tokens cannot be extended safely; affected users must sign in once to receive a fresh 30-day token.
