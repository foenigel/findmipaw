export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner"></div>

      <h2>FindMiPaw</h2>
      <p>Loading missing dog reports...</p>
    </div>
  );
}