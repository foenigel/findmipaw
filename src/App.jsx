import { useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import FoundStatus from './components/FoundStatus.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';
import logo from './components/images/findmipawlogo.png';
import heroImage from './components/images/hero-dog-image.png';
import strayDogOne from './components/images/stray-dog1.jpg';
import strayDogTwo from './components/images/stray-dog2.jpg';
import LoadingScreen from './components/LoadingScreen.jsx';

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const size = 400;
        const canvas = document.createElement('canvas');

        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Could not process image.');
        }

        // Use a white background for empty space around the photo.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, size, size);

        // Fit the entire photo inside the square without cropping.
        const scale = Math.min(
          size / image.width,
          size / image.height
        );

        const width = image.width * scale;
        const height = image.height * scale;

        const x = (size - width) / 2;
        const y = (size - height) / 2;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        context.drawImage(image, x, y, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);

            if (!blob) {
              reject(new Error('Image compression failed.'));
              return;
            }

            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(
              new Error('Could not read image.')
            );

            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.8
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load image.'));
    };

    image.src = objectUrl;
  });
}


function generateRecoveryKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return `FMP-${hex.match(/.{1,4}/g).join('-')}`;
}

function App() {
  const [dogs, setDogs] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
  return localStorage.getItem('findmipaw-theme') === 'dark';
});
  const [selectedId, setSelectedId] = useState(
  new URLSearchParams(window.location.search).get('dog') || ''
);
  const [addingSighting, setAddingSighting] = useState(false);
  const [sighting, setSighting] = useState({
  note: '',
  photo: '',
  lat: null,
  lng: null,
});
  const [notice, setNotice] = useState('');
  const [showReportForm, setShowReportForm] = useState(false);
const [newDog, setNewDog] = useState({
  name: '',
  color: '',
  lastSeen: '',
  details: '',
  photo: '',
  lat: null,
  lng: null,
});
  const [loadingDogs, setLoadingDogs] = useState(true);
  const [recoveryKeyToShow, setRecoveryKeyToShow] = useState('');
  const mapElement = useRef(null);
  const miniMapElement = useRef(null);
  const miniMapRef = useRef(null);
  const miniMapPinRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const selectingLocationRef = useRef(false);
  const selectingDogLocationRef = useRef(false);
  const requestingLocationRef = useRef(false);

  const dog = dogs.find((item) => item.id === selectedId) || dogs[0];

  function confirmAction({
  title,
  message,
  confirmText = 'Confirm',
  onConfirm,
}) {
  setConfirmation({
    title,
    message,
    confirmText,
    onConfirm,
  });
}

useEffect(() => {
  if (!notice) return;

  // Keep errors and action-required messages visible.
  const needsAttention =
    /could not|couldn't|unable|denied|failed|please|error/i.test(notice);

  if (needsAttention) return;

  const timeout = setTimeout(() => {
    setNotice('');
  }, 3500);

  return () => clearTimeout(timeout);
}, [notice]);

  useEffect(() => {
  async function loadDogs() {
    const { data, error } = await supabase
      .from('dogs')
      .select(`
        id,
        name,
        breed,
        color,
        last_seen,
        last_seen_lat,
        last_seen_lng,
        details,
        photo_url,
        status,
        created_at,
        sightings (
          id,
          lat,
          lng,
          note,
          photo_url,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Could not load dog reports:', error);
      setNotice('Could not load reports. Please refresh and try again.');
      setDogs([]);
      setLoadingDogs(false);
      return;
    }

    const formattedDogs = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      breed: item.breed || 'Not specified',
      color: item.color || '',
      lastSeen: item.last_seen,
      date: new Date(item.created_at).toLocaleDateString(),
      details: item.details || '',
      photo: item.photo_url || '',
      lat: item.last_seen_lat,
      lng: item.last_seen_lng,
      status: item.status,
      sightings: (item.sightings || []).map((s) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        note: s.note,
        photo: s.photo_url || '',
        time: new Date(s.created_at).toLocaleString(),
      })),
    }));

    setDogs(formattedDogs);
    setLoadingDogs(false);

    const requestedId = new URLSearchParams(
      window.location.search
    ).get('dog');

    if (requestedId && formattedDogs.some((item) => item.id === requestedId)) {
      setSelectedId(requestedId);
    } else if (formattedDogs.length > 0) {
      setSelectedId(formattedDogs[0].id);
    }
  }

  loadDogs();
}, []);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;

    const map = L.map(mapElement.current).setView([18.081, -88.558], 11);

L.tileLayer(
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }
).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('locationfound', (event) => {
      if (!requestingLocationRef.current) return;

      requestingLocationRef.current = false;
      selectingLocationRef.current = false;

      setSighting({
        note: '',
        photo: '',
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });

      setAddingSighting(true);
      setNotice('Location found! Add the sighting details.');
    });

    map.on('locationerror', () => {
      if (!requestingLocationRef.current) return;

      requestingLocationRef.current = false;

      setNotice(
        "Couldn't get your location. Allow location access or select a spot on the map."
      );
    });

map.on('click', (event) => {
  // Selecting the original last-seen location for a new dog report.
  if (selectingDogLocationRef.current) {
    selectingDogLocationRef.current = false;

    setNewDog((current) => ({
      ...current,
      lat: event.latlng.lat,
      lng: event.latlng.lng,
    }));

    setShowReportForm(true);
    setNotice('Last-seen location selected! Finish the report.');
    return;
  }

  // Selecting a location for a community sighting.
  if (!selectingLocationRef.current) return;

  selectingLocationRef.current = false;

  setSighting({
    note: '',
    photo: '',
    lat: event.latlng.lat,
    lng: event.latlng.lng,
  });

  setAddingSighting(true);
  setNotice('Location selected! Add the sighting details.');
});

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
}, [loadingDogs, Boolean(dog)]);


useEffect(() => {
  if (!showReportForm || !miniMapElement.current) return;

  const hasLocation = newDog.lat != null && newDog.lng != null;

  const miniMap = L.map(miniMapElement.current).setView(
    hasLocation ? [newDog.lat, newDog.lng] : [18.081, -88.558],
    hasLocation ? 15 : 11
  );

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(miniMap);

  miniMapPinRef.current = null;

  if (hasLocation) {
    miniMapPinRef.current = L.marker([
      newDog.lat,
      newDog.lng,
    ]).addTo(miniMap);
  }

  miniMap.on('click', (event) => {
    const { lat, lng } = event.latlng;

    if (miniMapPinRef.current) {
      miniMapPinRef.current.setLatLng([lat, lng]);
    } else {
      miniMapPinRef.current = L.marker([lat, lng]).addTo(miniMap);
    }

    setNewDog((current) => ({
      ...current,
      lat,
      lng,
    }));
  });

  miniMapRef.current = miniMap;

  setTimeout(() => miniMap.invalidateSize(), 100);

  return () => {
    miniMap.remove();
    miniMapRef.current = null;
    miniMapPinRef.current = null;
  };
}, [showReportForm]);


  useEffect(() => {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  localStorage.setItem('findmipaw-theme', darkMode ? 'dark' : 'light');
}, [darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers || !dog) return;

    markers.clearLayers();

    const lastSeenIcon = L.divIcon({
      className: 'pin-wrapper',
      html: '<div class="map-pin last-pin">🐕</div>',
      iconSize: [38, 38],
      iconAnchor: [19, 35],
    });

    const sightingIcon = L.divIcon({
      className: 'pin-wrapper',
      html: '<div class="map-pin sighting-pin">👀</div>',
      iconSize: [38, 38],
      iconAnchor: [19, 35],
    });

    if (dog.lat != null && dog.lng != null) {
  L.marker([dog.lat, dog.lng], { icon: lastSeenIcon })
    .bindPopup(`<b>${dog.name}</b><br/>Last known location`)
    .addTo(markers);

      map.setView([dog.lat, dog.lng], 13);
    } else {
      map.setView([18.081, -88.558], 11);
    }

    dog.sightings.forEach((item) => {
      L.marker([item.lat, item.lng], { icon: sightingIcon })
        .bindPopup(`<b>Reported sighting</b><br/>${item.note}<br/>${item.time}`)
        .addTo(markers);
    });

  }, [dog]);

  function selectDog(id) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('dog', id);
    window.history.replaceState({}, '', url);
  }


function markDogFound() {
  if (!dog) return;

  const dogToDelete = dog;

  confirmAction({
    title: 'Has this dog been found?',
    message: `Has ${dogToDelete.name} been found and safely reunited with their family? You will need the report's recovery key to permanently delete it and its associated photos.`,
    confirmText: 'Continue',
    onConfirm: () => {
      const recoveryKey = window.prompt(
        `Enter the recovery key for ${dogToDelete.name}'s report:`
      );

      if (recoveryKey === null) return;

      if (!recoveryKey.trim()) {
        setNotice('Please enter the recovery key.');
        return;
      }

      deleteDogReport(dogToDelete, recoveryKey);
    },
  });
}

async function deleteDogReport(dogToDelete, recoveryKey) {
  try {
    const { data, error } = await supabase.functions.invoke(
      'dog-reports',
      {
        body: {
          action: 'delete',
          dogId: dogToDelete.id,
          recoveryKey,
        },
      }
    );

    if (error) {
      let message = error.message;

      try {
        const responseBody = await error.context?.json();
        if (responseBody?.error) {
          message = responseBody.error;
        }
      } catch {
        // Keep the original error message.
      }

      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Could not delete the report.');
    }

    const remainingDogs = dogs.filter(
      (item) => item.id !== dogToDelete.id
    );

    setDogs(remainingDogs);

    if (remainingDogs.length > 0) {
      const nextDog = remainingDogs[0];

      setSelectedId(nextDog.id);

      const url = new URL(window.location.href);
      url.searchParams.set('dog', nextDog.id);
      window.history.replaceState({}, '', url);
    } else {
      setSelectedId('');

      const url = new URL(window.location.href);
      url.searchParams.delete('dog');
      window.history.replaceState({}, '', url);
    }

    setNotice(
      `${dogToDelete.name}'s report and associated photos have been permanently deleted. 💚`
    );

  } catch (error) {
    console.error('Could not delete dog report:', error);

    setNotice(
      error.message || `Could not delete ${dogToDelete.name}'s report.`
    );
  }
}


async function shareReport() {
  const url = new URL(window.location.href);
  url.searchParams.set('dog', dog.id);

  const shareData = {
    title: `Missing dog: ${dog.name} | FindMiPaw`,
    text: `Help bring ${dog.name} home! Last seen: ${dog.lastSeen}. If you've seen this dog, please check the report and share it.`,
    url: url.toString(),
  };

  // On phones and supported browsers, open the share menu.
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (error) {
      // The user may have cancelled the share menu.
      if (error.name !== 'AbortError') {
        setNotice('Unable to share. Please try copying the link.');
      }
    }

    return;
  }

  // Otherwise, copy the link so it can be pasted into Facebook.
  try {
    await navigator.clipboard.writeText(url.toString());
    setNotice('Report link copied! Paste it into your Facebook post.');
  } catch {
    setNotice('Unable to copy the link automatically. Please try sharing again.');
  }
}


async function submitSighting(event) {
  event.preventDefault();

  if (sighting.lat == null || sighting.lng == null) {
    setNotice('Please select a location on the map first.');
    return;
  }

  if (!sighting.note.trim()) {
    setNotice('Please add a description of the sighting.');
    return;
  }

  if (!dog) return;

  let photoUrl = null;
  let photoPath = null;

  try {
    // 1. Upload the optional sighting photo.
    if (sighting.photo) {
      const response = await fetch(sighting.photo);
      const photoBlob = await response.blob();

      photoPath = `sightings/${dog.id}/${crypto.randomUUID()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('dog-photos')
        .upload(photoPath, photoBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('dog-photos')
        .getPublicUrl(photoPath);

      photoUrl = urlData.publicUrl;
    }

    // 2. Save the sighting to Supabase.
    const { data, error } = await supabase
      .from('sightings')
      .insert({
        dog_id: dog.id,
        lat: sighting.lat,
        lng: sighting.lng,
        note: sighting.note.trim(),
        photo_url: photoUrl,
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Add the saved sighting to the local app state.
    const newSighting = {
      id: data.id,
      lat: data.lat,
      lng: data.lng,
      note: data.note,
      photo: data.photo_url || '',
      time: new Date(data.created_at).toLocaleString(),
    };

    setDogs((current) =>
      current.map((item) =>
        item.id === dog.id
          ? {
              ...item,
              sightings: [...item.sightings, newSighting],
            }
          : item
      )
    );

    // 4. Close the form and reset its fields.
    setAddingSighting(false);

    setSighting({
      note: '',
      photo: '',
      lat: null,
      lng: null,
    });

    setNotice('Sighting saved successfully! 🐾');

  } catch (error) {
    console.error('Could not save sighting:', error);

    // Remove the uploaded photo if saving the sighting failed.
    if (photoPath) {
      const { error: cleanupError } = await supabase.storage
        .from('dog-photos')
        .remove([photoPath]);

      if (cleanupError) {
        console.error('Could not clean up sighting photo:', cleanupError);
      }
    }

    setNotice(`Could not save sighting: ${error.message}`);
  }
}



async function submitDog(event) {
  event.preventDefault();

  if (newDog.lat == null || newDog.lng == null) {
    setNotice('Please pin the last-seen location on the map before submitting.');
    return;
  }

  let photoUrl = null;
  let photoPath = null;

  try {
    // 1. Upload the optional dog photo.
    if (newDog.photo) {
      const response = await fetch(newDog.photo);
      const photoBlob = await response.blob();

      photoPath = `dogs/${crypto.randomUUID()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('dog-photos')
        .upload(photoPath, photoBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('dog-photos')
        .getPublicUrl(photoPath);

      photoUrl = urlData.publicUrl;
    }

    // 2. Generate the report's recovery key.
    const recoveryKey = generateRecoveryKey();

    // 3. Create the report and register its recovery key securely.
    const { data: result, error } = await supabase.functions.invoke(
      'dog-reports',
      {
        body: {
          action: 'create',
          recoveryKey,
          dog: {
            name: newDog.name.trim(),
            breed: 'Not specified',
            color: newDog.color.trim(),
            last_seen: newDog.lastSeen.trim(),
            last_seen_lat: newDog.lat,
            last_seen_lng: newDog.lng,
            details: newDog.details.trim(),
            photo_url: photoUrl,
          },
        },
      }
    );

    if (error) {
      let message = error.message;

      try {
        const responseBody = await error.context?.json();
        if (responseBody?.error) {
          message = responseBody.error;
        }
      } catch {
        // Keep the original error message.
      }

      throw new Error(message);
    }

    if (!result?.success || !result?.dog) {
      throw new Error(result?.error || 'Could not create the report.');
    }

    const data = result.dog;

    // 4. Add the new report to the app.
    const created = {
      id: data.id,
      name: data.name,
      breed: data.breed || 'Not specified',
      color: data.color || '',
      lastSeen: data.last_seen,
      date: new Date(data.created_at).toLocaleDateString(),
      details: data.details || '',
      photo: data.photo_url || '',
      lat: data.last_seen_lat,
      lng: data.last_seen_lng,
      status: data.status,
      sightings: [],
    };

    setDogs((current) => [created, ...current]);
    setSelectedId(created.id);

    const url = new URL(window.location.href);
    url.searchParams.set('dog', created.id);
    window.history.replaceState({}, '', url);

    setNewDog({
      name: '',
      color: '',
      lastSeen: '',
      details: '',
      photo: '',
      lat: null,
      lng: null,
    });

    setShowReportForm(false);

    // 5. Show the recovery key once.
    setRecoveryKeyToShow(recoveryKey);

    setNotice('Report saved successfully! 🐾');

  } catch (error) {
    console.error('Could not create dog report:', error);

    // Clean up the uploaded photo if report creation failed.
    if (photoPath) {
      const { error: cleanupError } = await supabase.storage
        .from('dog-photos')
        .remove([photoPath]);

      if (cleanupError) {
        console.error('Could not clean up uploaded photo:', cleanupError);
      }
    }

    setNotice(`Could not create report: ${error.message}`);
  }
}


if (loadingDogs) {
  return <LoadingScreen />;
}

if (!dog) {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon"><img src={logo} alt="FindMiPaw" /></span>
        </a>
      </header>

      <main className="page">
        <section className="hero">
          <span className="eyebrow">YOUR COMMUNITY. ONE MISSION.</span>
          <h1>Bring them <span>home.</span></h1>
          <p>No dog reports yet. Start by creating the first report.</p>
        <div className="map-container" ref={mapElement} />

      {/* <button
        type="button"
        className="primary-button"
        onClick={() => {
        setShowReportForm(false);
        selectingDogLocationRef.current = true;
        selectingLocationRef.current = false;
        setNotice('Tap the map to pin where the dog was last seen.');
      }}
      >
        📍 Pin last-seen location on map
      </button> */}
          <button
            className="primary-button"
            onClick={() => setShowReportForm(true)}
          >
            + Report a missing dog
          </button>
        </section>
      </main>

      {showReportForm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowReportForm(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-button"
              onClick={() => setShowReportForm(false)}
            >
              ✕
            </button>

            <h2>Report a missing dog</h2>

            <form onSubmit={submitDog}>
              <label>Dog's name</label>
              <input
                required
                value={newDog.name}
                onChange={(e) =>
                  setNewDog({ ...newDog, name: e.target.value })
                }
              />

              <label>Color or appearance</label>
              <input
                required
                value={newDog.color}
                onChange={(e) =>
                  setNewDog({ ...newDog, color: e.target.value })
                }
              />

<label>Last seen location</label>
<input
  required
  placeholder="e.g. Orange Walk Town"
  value={newDog.lastSeen}
  onChange={(e) =>
    setNewDog({ ...newDog, lastSeen: e.target.value })
  }
/>


<button
  type="button"
  className="primary-button"
  onClick={() => {
    if (!navigator.geolocation) {
      setNotice('Your browser does not support location detection.');
      return;
    }

    setNotice('Finding your location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setNewDog((current) => ({
          ...current,
          lat,
          lng,
        }));

        if (miniMapRef.current) {
          miniMapRef.current.setView([lat, lng], 16);

          if (miniMapPinRef.current) {
            miniMapPinRef.current.setLatLng([lat, lng]);
          } else {
            miniMapPinRef.current = L.marker([lat, lng])
              .addTo(miniMapRef.current);
          }
        }

        setNotice('Location found! Check the pin before submitting.');
      },
      (error) => {
        if (error.code === 1) {
          setNotice('Location access was denied. You can tap the map to pin the location.');
        } else {
          setNotice('Could not find your location. Try tapping the map instead.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }}
>
  <i class="fa-solid fa-street-view"></i> Use my current location 
</button>

<p className="form-hint">
  Or tap the map to pin the exact location.
</p>

<div
  ref={miniMapElement}
  className="mini-map-container"
/>

{newDog.lat != null && newDog.lng != null && (
  <p className="form-hint">
    Location pinned: {newDog.lat.toFixed(5)}, {newDog.lng.toFixed(5)}
  </p>
)}


<div className="photo-upload-section">
  <label htmlFor="missing-dog-photo-empty">Dog's photo (optional)</label>

  <label
    htmlFor="missing-dog-photo-empty"
    className="photo-upload-box"
  >
    {newDog.photo ? (
      <img
        src={newDog.photo}
        alt="Dog preview"
        className="photo-upload-preview"
      />
    ) : (
      <>
        <span className="photo-camera"><i class="fa-regular fa-image"></i></span>
        <strong>Add a photo</strong>
        <span>Tap to choose a photo</span>
      </>
    )}
  </label>

  <input
    id="missing-dog-photo-empty"
    className="photo-file-input"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onChange={async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        setNotice('Please choose an image smaller than 5 MB.');
        event.target.value = '';
        return;
      }

      try {
        const compressedPhoto = await compressImage(file);
        setNewDog((current) => ({
          ...current,
          photo: compressedPhoto,
        }));
      } catch {
        setNotice('Could not process this photo. Please try another image.');
      }
    }}
  />
</div>


              <label>Additional details</label>
              <textarea
                value={newDog.details}
                onChange={(e) =>
                  setNewDog({ ...newDog, details: e.target.value })
                }
              />

              <button className="primary-button" type="submit">
                Create report
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

  return (
    <div className="app">

<header className="topbar">
  <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
    <img src={logo} alt="FindMiPaw" />
  </a>

<button
  type="button"
  className={`theme-toggle ${darkMode ? 'dark' : ''}`}
  onClick={() => setDarkMode((current) => !current)}
  aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
  aria-pressed={darkMode}
  title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
>
  <i className={`fa-solid ${darkMode ? 'fa-moon' : 'fa-sun'}`}></i>
</button>
</header>


      <main className="page">
        <section className="hero">
          <span className="eyebrow">YOUR COMMUNITY. ONE MISSION.</span>
          <h1>
            Bring them <span>home.</span>
          </h1>
          <p>
            Report a missing dog, share its map, and help your community bring
            lost pets back to their families.
          </p>
          <button
            className="primary-button"
            onClick={() => setShowReportForm(true)}
          >
            + Report a missing dog
          </button>
          <div className="hero-Container">
            <img class="stray-dog-one" src={strayDogOne} alt="Stray dog" />
          <img class="hero-image" src={heroImage} alt="Missing dog Image" />
          <img class="stray-dog-two" src={strayDogTwo} alt="Stray dog" />
          </div>
        </section>

        <section className="workspace">
          <aside className="sidebar">
            <div className="section-heading">
              <div>
    <h2>Missing dogs</h2>

    <div className="active-feed-info">
      <span className="active-feed-badge">
        <i class="fa-solid fa-users"></i>  COMMUNITY FEED
      </span>
      <p>
      {dogs.length} community {dogs.length === 1 ? 'report' : 'reports'}
    </p>
    </div>
  </div>
              <span className="paw-badge"><i class="fa-solid fa-list-ul"></i></span>
            </div>

            {dogs.map((item) => (
              <button
                key={item.id}
                className={`dog-card ${item.id === dog.id ? 'selected' : ''}`}
                onClick={() => selectDog(item.id)}
              >
                {item.photo ? (
                  <img
                    className="dog-avatar dog-avatar-photo"
                    src={item.photo}
                    alt={item.name}
                  />
                ) : (
                  <span className="dog-avatar">🐕</span>
                )}
                <span className="dog-card-text">
                  <strong>{item.name}</strong>
                  <span>{item.color || item.breed}</span>
                  <small><i class="fa-regular fa-compass"></i> {item.lastSeen}</small>
                </span>
                <span className="status-dot" />
              </button>
            ))}

            <div className="help-card">
              <span><i class="fa-solid fa-hand-holding-heart"></i></span>
              <strong>Every sighting matters.</strong>
              <p>See a missing dog? Add a pin to help its family.</p>
            </div>
          </aside>

          <section className="report-panel">
            <div className={`report-heading ${dog.status === 'Found' ? 'is-found' : ''}`}>
              <div className="report-heading-main">
                {dog.status === 'Found' ? (
                  <span className="found-label">🐶 DOG FOUND</span>
                ) : (
                  <span className="missing-label">
                    <span /> MISSING DOG
                  </span>
                )}
                <h2>{dog.name}</h2>
                <p>{dog.lastSeen}</p>
              </div>
              <div className="report-actions">
        <button className="share-button" onClick={shareReport}>
          <i class="fa-solid fa-share-nodes"></i> Share report
        </button>

  <FoundStatus
    dog={dog}
    onMarkFound={markDogFound}
  />
</div>
            </div>
            {dog.photo && (
              <img
                src={dog.photo}
                alt={dog.name}
                className="dog-report-photo"
              />
            )}
            <div className="dog-details">
              <div>
                <span>COLOR</span>
                <strong>{dog.color || 'Not specified'}</strong>
              </div>
              <div>
                <span>LAST SEEN</span>
                <strong>{dog.date}</strong>
              </div>
              <div>
                <span>SIGHTINGS</span>
                <strong>{dog.sightings.length}</strong>
              </div>
            </div>

            <div className="map-title">
              <span className="live-badge">
                <i className="fa-solid fa-route"></i>
              </span>

              <div className="map-title-text">
                <h3>Community sightings map</h3>
                <p>Where did you see this dog?</p>
              </div>
            </div>

            <p className="map-instructions">
              Choose how you'd like to share the location.
            </p>

            <button
              type="button"
              className="primary-button sighting-button"
              onClick={() => {
                if (!mapRef.current) return;

                requestingLocationRef.current = true;
                selectingLocationRef.current = false;

                setNotice('Finding your location...');

                mapRef.current.locate({
                setView: false,
                enableHighAccuracy: true,
                timeout: 15000,
              });
              }}
            >
              <span className="button-main">
              <i class="fa-solid fa-street-view"></i> Use my current location</span>
              <span className="button-hint">Quickly detect where you are</span>
            </button>

            <div className="map-container" ref={mapElement} />

            <div className="map-legend">
              <span>
                <i className="legend-red" /> Last known location
              </span>
              <span>
                <i className="legend-blue" /> Reported sighting
              </span>
            </div>

           <button
              type="button"
              className="primary-button sighting-button"
              onClick={() => {
                setAddingSighting(false);
                selectingLocationRef.current = true;
                setSighting({ note: '', photo: '', lat: null, lng: null });
                setNotice('Tap the map at the exact location of the sighting.');
              }}
            >
              <span className="button-main">
                <i className="fa-solid fa-location-dot"></i>
                Choose a different location
              </span>
              <span className="button-hint">
                Select where you spotted the dog on the map
              </span>
            </button>

            <div className="sightings-list">
              <h3><i class="fa-regular fa-eye"></i> Recent sightings</h3>
              {dog.sightings.length === 0 ? (
                <p className="empty-state">
                  No sightings yet. Help spread the word!
                </p>
              ) : (
                dog.sightings
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div className="sighting-item" key={item.id}>
                      <div className="sighting-card">
                        <strong><i class="fa-regular fa-message"></i> Possible sighting</strong>
                        <p>{item.note}</p>
                        {item.photo && (
                          <img
                            src={item.photo}
                            alt="Sighting"
                            className="sighting-photo"
                          />
                        )}

                        <small>{item.time}</small>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </section>
        </section>

        <footer>
           <span className="brand-icon"><img src={logo} alt="FindMiPaw" /></span>
          <span>Built with care for Belize's missing pets.</span>
        </footer>
      </main>

      {(addingSighting || showReportForm) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setAddingSighting(false);
            setShowReportForm(false);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-button"
              onClick={() => {
                setAddingSighting(false);
                setShowReportForm(false);
              }}
            >
              ✕
            </button>

            {addingSighting ? (
              <>
                <span className="eyebrow">HELP BRING THEM HOME</span>
                <h2>Report a sighting</h2>
                <p className="modal-intro">
                  Add details to help {dog.name}'s family.
                </p>
                <form onSubmit={submitSighting}>
                  <label>What did you see?</label>
                  <textarea
                    required
                    placeholder="Describe where you saw the dog and what happened..."
                    value={sighting.note}
                    onChange={(e) =>
                      setSighting({
                        ...sighting,
                        note: e.target.value,
                      })
                    }
                  />

                  <div className="photo-upload-section">
                    <label htmlFor="sighting-photo">Sighting photo (optional)</label>

                    <label htmlFor="sighting-photo" className="photo-upload-box">
                      {sighting.photo ? (
                        <img
                          src={sighting.photo}
                          alt="Sighting preview"
                          className="photo-upload-preview"
                        />
                      ) : (
                        <>
                          <span className="photo-camera"><i class="fa-regular fa-image"></i></span>
                          <strong>Add a photo</strong>
                          <span>Tap to choose a photo</span>
                        </>
                      )}
                    </label>

                    <input
                      id="sighting-photo"
                      className="photo-file-input"
                      type="file"
                      accept="image/*"
                      
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;

                        if (!file.type.startsWith('image/')) {
                          setNotice('Please select an image.');
                          event.target.value = '';
                          return;
                        }

                        if (file.size > 5 * 1024 * 1024) {
                          setNotice('Please choose an image smaller than 5 MB.');
                          event.target.value = '';
                          return;
                        }

                        try {
                          const compressedPhoto = await compressImage(file);

                          setSighting((current) => ({
                            ...current,
                            photo: compressedPhoto,
                          }));
                        } catch {
                          setNotice('Could not process this photo. Please try another image.');
                          event.target.value = '';
                        }
                      }}

                    />
                  </div>

                  
                  <p className="form-hint">
                    {sighting.lat != null && sighting.lng != null
                      ? 'A location has been selected on the map.'
                      : 'Choose a location on the map first.'}
                  </p>
                  <button className="primary-button" type="submit">
                    Submit sighting
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="eyebrow">START A SEARCH</span>
                <h2>Report a missing dog</h2>
                <p className="modal-intro">
                  Share the details so the community can help.
                </p>
                <form onSubmit={submitDog}>
                  <label>Dog's name</label>
                  <input
                    required
                    placeholder="e.g. Brownie"
                    value={newDog.name}
                    onChange={(e) =>
                      setNewDog({ ...newDog, name: e.target.value })
                    }
                  />
                  <label>Color or appearance</label>
                  <input
                    required
                    placeholder="e.g. Small, brown, short legs"
                    value={newDog.color}
                    onChange={(e) =>
                      setNewDog({ ...newDog, color: e.target.value })
                    }
                  />

                  <div className="photo-upload-section">
                    <label htmlFor="missing-dog-photo">Dog's photo</label>

                    <label htmlFor="missing-dog-photo" className="photo-upload-box">
                      {newDog.photo ? (
                        <img
                          src={newDog.photo}
                          alt="Dog preview"
                          className="photo-upload-preview"
                        />
                      ) : (
                        <>
                          <span className="photo-camera"><i class="fa-regular fa-image"></i></span>
                          <strong>Add a photo</strong>
                          <span>Tap to choose a photo</span>
                        </>
                      )}
                    </label>

                    <input
                      id="missing-dog-photo"
                      className="photo-file-input"
                      type="file"
                      accept="image/*"
                      
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;

                        if (!file.type.startsWith('image/')) {
                          setNotice('Please select an image.');
                          event.target.value = '';
                          return;
                        }

                        if (file.size > 5 * 1024 * 1024) {
                          setNotice('Please choose an image smaller than 5 MB.');
                          event.target.value = '';
                          return;
                        }

                        try {
                          const compressedPhoto = await compressImage(file);

                          setNewDog((current) => ({
                            ...current,
                            photo: compressedPhoto,
                          }));
                        } catch {
                          setNotice('Could not process this photo. Please try another image.');
                          event.target.value = '';
                        }
                      }}
                    />

                    {newDog.photo && (
                      <button
                        type="button"
                        className="remove-photo-button"
                        onClick={() => {
                          setNewDog((current) => ({ ...current, photo: '' }));
                          const input = document.getElementById('missing-dog-photo');
                          if (input) input.value = '';
                        }}
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                  <label>Last seen location</label>
                  <input
                    required
                    placeholder="e.g. Orange Walk Town"
                    value={newDog.lastSeen}
                    onChange={(e) =>
                      setNewDog({ ...newDog, lastSeen: e.target.value })
                    }
                  />
                 
<button
  type="button"
  className="primary-button"
  onClick={() => {
    if (!navigator.geolocation) {
      setNotice('Your browser does not support location detection.');
      return;
    }

    setNotice('Finding your location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setNewDog((current) => ({
          ...current,
          lat,
          lng,
        }));

        if (miniMapRef.current) {
          miniMapRef.current.setView([lat, lng], 16);

          if (miniMapPinRef.current) {
            miniMapPinRef.current.setLatLng([lat, lng]);
          } else {
            miniMapPinRef.current = L.marker([lat, lng])
              .addTo(miniMapRef.current);
          }
        }

        setNotice('Location found! Check the pin before submitting.');
      },
      (error) => {
        setNotice(
          error.code === 1
            ? 'Location access was denied. You can tap the map instead.'
            : 'Could not find your location. Try tapping the map instead.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }}
>
  <i class="fa-solid fa-street-view"></i> Use my current location
</button>


                  <div
                    ref={miniMapElement}
                    className="mini-map-container"
                  />

                  {newDog.lat != null && newDog.lng != null && (
                    <p className="form-hint">
                      Location pinned: {newDog.lat.toFixed(5)}, {newDog.lng.toFixed(5)}
                    </p>
                  )}
                  <label>Additional details</label>
                  <textarea
                    placeholder="When did they go missing? Any identifying features?"
                    value={newDog.details}
                    onChange={(e) =>
                      setNewDog({ ...newDog, details: e.target.value })
                    }
                  />
                  <button className="primary-button" type="submit">
                    Create report
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {notice && (
  <div className="toast" role="status" aria-live="polite" key={notice}>
    <span className="toast-icon">
      <i className="fa-solid fa-paw"></i>
    </span>

    <span className="toast-message">{notice}</span>

    <button
      className="toast-close"
      onClick={() => setNotice('')}
      aria-label="Dismiss notification"
    >
      <i className="fa-solid fa-xmark"></i>
    </button>
  </div>
)}

{confirmation && (
  <div className="toast confirmation-toast" role="alertdialog">
    <span className="toast-icon">
      <i className="fa-solid fa-circle-question"></i>
    </span>

    <div className="toast-content">
      <strong>{confirmation.title}</strong>
      <p>{confirmation.message}</p>

      <div className="toast-actions">
        <button
          className="toast-cancel"
          onClick={() => setConfirmation(null)}
        >
          Cancel
        </button>

        <button
          className="toast-confirm"
          onClick={() => {
            const action = confirmation.onConfirm;
            setConfirmation(null);
            action();
          }}
        >
          {confirmation.confirmText || 'Confirm'}
        </button>
      </div>
    </div>
  </div>
)}


{recoveryKeyToShow && (
  <div className="modal-backdrop">
    <div className="modal">
      <span className="eyebrow">KEEP THIS KEY SAFE</span>

      <h2>Your recovery key</h2>

      <p className="modal-intro">
        Save this key somewhere safe. You'll need it to permanently
        delete this report when your dog is found. It cannot be
        retrieved from the app later.
      </p>

      <p
        style={{
          padding: '16px',
          background: 'var(--input-bg, #f2f2f2)',
          borderRadius: '10px',
          textAlign: 'center',
          overflowWrap: 'anywhere',
        }}
      >
        <strong>{recoveryKeyToShow}</strong>
      </p>

        <div className="recovery-key-actions">
      <button
        type="button"
        className="primary-button"
        onClick={async () => {
          try {
            if (!navigator.clipboard?.writeText) {
              throw new Error('Clipboard unavailable');
            }

            await navigator.clipboard.writeText(recoveryKeyToShow);
            setNotice('Recovery key copied! Keep it somewhere safe.');
          } catch {
            setNotice('Please select and copy the recovery key manually.');
          }
        }}
      >
        <i className="fa-regular fa-copy"></i> Copy recovery key
      </button>

      <button
        type="button"
        className="share-button"
        onClick={() => setRecoveryKeyToShow('')}
      >
        I've saved my key
      </button>
      </div>
    </div>
  </div>
)}


    </div>
  );
}

export default App;
