
import { useState } from 'react';

export default function PetReportForm({
  onPhotoChange,
  id = 'pet-photo',
  label = "Pet's photo",
}) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  function handleChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Please choose an image smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = reader.result;
      setPreview(image);
      setError('');
      onPhotoChange(image);
    };

    reader.onerror = () => {
      setError('Could not read this image. Please try another.');
    };

    reader.readAsDataURL(file);
  }

  return (
    <div className="photo-upload">
      <label htmlFor={id}>{label}</label>

      <input
        id={id}
        type="file"
        accept="image/*"
        onChange={handleChange}
      />

      {error && <p className="form-hint">{error}</p>}

      {preview && (
        <img
          src={preview}
          alt="Selected photo preview"
          className="photo-preview"
        />
      )}
    </div>
  );
}
