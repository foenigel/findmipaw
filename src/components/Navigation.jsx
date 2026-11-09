
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Navigation.css';

function Navigation({ target, onClose }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastRouteOriginRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [status, setStatus] = useState('Finding your location...');
  const [gpsError, setGpsError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);

  function calculateDistance(start, end) {
    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371;

    const latDifference = toRadians(end.lat - start.lat);
    const lngDifference = toRadians(end.lng - start.lng);

    const value =
      Math.sin(latDifference / 2) ** 2 +
      Math.cos(toRadians(start.lat)) *
        Math.cos(toRadians(end.lat)) *
        Math.sin(lngDifference / 2) ** 2;

    return earthRadius * 2 * Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    );
  }

  async function updateRoute(start, map) {
    if (!map) return;

    setRouteLoading(true);

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${start.lng},${start.lat};${target.lng},${target.lat}` +
        `?overview=full&geometries=geojson`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Route service unavailable.');
      }

      const data = await response.json();

      if (!data.routes?.length) {
        throw new Error('No driving route found.');
      }

      const route = data.routes[0];

      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
      }

      routeLayerRef.current = L.geoJSON(route.geometry, {
        style: {
          color: '#1685e8',
          weight: 6,
          opacity: 0.85,
        },
      }).addTo(map);

      setDistance(route.distance / 1000);
      setDuration(route.duration / 60);
      lastRouteOriginRef.current = start;

    } catch (error) {
      console.error('Could not calculate route:', error);
      setStatus('Could not calculate a road route. Try Google Maps instead.');
    } finally {
      setRouteLoading(false);
    }
  }

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;

    const map = L.map(mapElement.current).setView(
      [target.lat, target.lng],
      14
    );

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    const destinationIcon = L.divIcon({
      className: 'navigation-pin-wrapper',
      html: '<div class="navigation-destination-pin">👀</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 36],
    });

    destinationMarkerRef.current = L.marker(
      [target.lat, target.lng],
      { icon: destinationIcon }
    )
      .bindTooltip('Dog sighting here', {
        permanent: true,
        direction: 'top',
        offset: [0, -30],
        })
      .addTo(map);

    if (!navigator.geolocation) {
      setStatus('Your browser does not support GPS location.');
      return () => {
        map.remove();
        mapRef.current = null;
      };
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(current);
        setStatus('Location Active');
        setGpsError('');

        const userIcon = L.divIcon({
          className: 'navigation-pin-wrapper',
          html: '<div class="navigation-user-pin"><span></span></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([current.lat, current.lng]);
        } else {
        userMarkerRef.current = L.marker([current.lat, current.lng], { icon: userIcon })
            .bindTooltip('You are here', {
            permanent: true,
            direction: 'top',
            offset: [0, -15],
            })
            .addTo(map);
        }

        const previous = lastRouteOriginRef.current;
        const movedEnough =
          !previous ||
          calculateDistance(previous, current) >= 0.25;

        if (movedEnough) {
          await updateRoute(current, map);
        }

        if (!previous) {
          map.fitBounds(
            L.latLngBounds(
              [current.lat, current.lng],
              [target.lat, target.lng]
            ).pad(0.2)
          );
        }
      },
        (error) => {
        console.warn('GPS unavailable:', error.message);

        setStatus('Location Inactive');

        if (error.code === 1) {
            setGpsError(
            'Location access is blocked. Open your device or browser settings, find Location or Site Permissions, allow location access for FindMiPaw, then reload this page.'
            );
        } else if (error.code === 2) {
            setGpsError(
            'We cannot detect your location yet. Make sure Location Services are enabled on your device, allow location access for your browser, and try moving outdoors.'
            );
        } else if (error.code === 3) {
            setGpsError(
            'Your location is taking too long to load. Check your internet connection, make sure location access is enabled, and try again somewhere with a clearer GPS signal.'
            );
        } else {
            setGpsError(
            'We could not access your location. Check your device location settings and browser permissions, then try again.'
            );
        }
        },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      }
    );

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      destinationMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, [target.lat, target.lng]);

  const googleMapsUrl =
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${target.lat},${target.lng}` +
    `&travelmode=driving`;

  return (
    <div className="navigation-screen">
        <div className="navigation-header">
        <button
          type="button"
          className="navigation-back"
          onClick={onClose}
        >
          <i className="fa-solid fa-arrow-left"></i> Go Back Home
        </button><span className="navigationheader-subtitle">See how close your dog is.</span>
        
        </div>
      {/* <header className="navigation-header">
        <button
          type="button"
          className="navigation-back"
          onClick={onClose}
        >
          <i className="fa-solid fa-arrow-left"></i> Back Home
        </button>

        <div className="navigation-header-title">
          <h2>Navigate to sighting</h2>
          <p>{target.label || 'Reported dog sighting'}</p>
        </div>
      </header> */}

    <div className="navigationmap-container">
   <div className="navigation-map" ref={mapElement} />
    </div>

<section className="navigation-info">

<div className="navigation-help">
  <strong>Live GPS Navigation</strong>
  <p>
    Follow your live location on the map to reach the reported dog sighting.
    Allow location access to see your position, route, and distance.
  </p>
</div>
        <div className="navigation-status">
        <span className={userLocation ? 'gps-active' : 'gps-waiting'} />

        <div className="navigation-status-text">
            <strong>{userLocation ? 'GPS Connected' : 'GPS Not Connected'}</strong>
            <p>{status}</p>
        </div>
        </div>

        {gpsError && (
        <div className="navigation-gps-message">
            <strong>Location assistance</strong>
            <p>{gpsError}</p>
        </div>
        )}

        <div className="navigation-stats">
          <div>
            <span>Road distance</span>
            <strong>
              {distance !== null
                ? `${distance.toFixed(1)} km`
                : '--'}
            </strong>
          </div>

          <div>
            <span>Estimated drive</span>
            <strong>
              {duration !== null
                ? `${Math.max(1, Math.round(duration))} min`
                : '--'}
            </strong>
          </div>
        </div>

        {routeLoading && (
          <p className="navigation-hint">Updating route...</p>
        )}

        {userLocation && (
          <p className="navigation-hint">
            Your GPS position updates as you move. The route refreshes after
            you move approximately 250 metres.
          </p>
        )}

        <a
          className="navigation-google-button"
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fa-solid fa-diamond-turn-right"></i>
          Open in Google Maps
        </a>

        <button
          type="button"
          className="navigation-stop-button"
          onClick={onClose}
        >
          Stop navigation
        </button>
      </section>
    </div>
  );
}

export default Navigation;
