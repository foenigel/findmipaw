
export default function FoundStatus({ dog, onMarkFound }) {
  if (dog.status === 'Found') {
    return (
      <div className="found-banner">
        <strong>💚 Great news! {dog.name} is home safe!</strong>
        <p>
          Thank you to everyone who helped bring this pet
          back to their family.
        </p>
      </div>
    );
  }

  return (
    <button
      className="mark-found-button"
      onClick={onMarkFound}
    >
      <i className="fa-solid fa-circle-check"></i> Mark as Found
    </button>
  );
}
