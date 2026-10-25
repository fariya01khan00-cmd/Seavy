import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  MapCameraChangedEvent,
  Pin,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { FamilyEmergencyContact } from '../types';
import { apiFetch } from '../config/api';

interface LatLngCoords {
  lat: number;
  lng: number;
}

interface RawPlaceLocation {
  lat: (() => number) | number;
  lng: (() => number) | number;
}

interface RawPlaceItem {
  id?: string;
  displayName?: string | null;
  location?: RawPlaceLocation | null;
  formattedAddress?: string | null;
  nationalPhoneNumber?: string | null;
  internationalPhoneNumber?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsURI?: string | null;
}

interface NearbyDoctorResult {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsURI: string | null;
  location: LatLngCoords;
  distanceMeters: number | null;
  isPublicSafeSpot?: boolean;
}

type FacilityCategory =
  | 'all_medical'
  | 'public_safe_spots'
  | 'doctor'
  | 'hospital'
  | 'pharmacy';

const FACILITY_FILTERS: {
  id: FacilityCategory;
  labelEn: string;
  labelHi: string;
  primaryTypes: string[];
}[] = [
  {
    id: 'all_medical',
    labelEn: 'Clinics & Hospitals',
    labelHi: 'डॉक्टर व क्लिनिक',
    primaryTypes: ['doctor', 'medical_clinic', 'hospital'],
  },
  {
    id: 'public_safe_spots',
    labelEn: 'Crowded Public Safe Spots',
    labelHi: 'सुरक्षित सार्वजनिक स्थान',
    primaryTypes: [
      'police',
      'transit_station',
      'subway_station',
      'hospital',
      'pharmacy',
      'hotel',
      'shopping_mall',
    ],
  },
  {
    id: 'doctor',
    labelEn: 'Specialists',
    labelHi: 'केवल डॉक्टर',
    primaryTypes: ['doctor'],
  },
  {
    id: 'hospital',
    labelEn: 'Hospitals',
    labelHi: 'अस्पताल',
    primaryTypes: ['hospital'],
  },
  {
    id: 'pharmacy',
    labelEn: '24/7 Pharmacies',
    labelHi: 'मेडिकल स्टोर',
    primaryTypes: ['pharmacy'],
  },
];

const INITIAL_FALLBACK_CENTER: LatLngCoords = {
  lat: 19.076,
  lng: 72.8777,
};

function computeHaversineMeters(a: LatLngCoords, b: LatLngCoords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

function formatDistance(meters: number | null): string | null {
  if (meters === null) return null;
  if (meters < 1000) return `${meters} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

function formatDurationMillis(ms: number | string | null | undefined): string {
  if (!ms) return '';
  const numeric = typeof ms === 'string' ? parseInt(ms.replace(/\D/g, ''), 10) * 1000 : ms;
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const mins = Math.max(1, Math.round(numeric / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

interface InnerMapWorkspaceProps {
  isHi: boolean;
  familyContacts: FamilyEmergencyContact[];
  liveLocationPermitted: boolean;
  onToggleLiveLocationPermitted?: (next: boolean) => void;
  onShowToast: (msg: string) => void;
}

const InnerNearbyDoctorsWorkspace: React.FC<InnerMapWorkspaceProps> = ({
  isHi,
  familyContacts,
  liveLocationPermitted,
  onToggleLiveLocationPermitted,
  onShowToast,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const apiStatus = useApiLoadingStatus();

  const [cameraCenter, setCameraCenter] = useState<LatLngCoords>(INITIAL_FALLBACK_CENTER);
  const [cameraZoom, setCameraZoom] = useState<number>(14);
  const [userGpsPos, setUserGpsPos] = useState<LatLngCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'active' | 'denied'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // Upper Location Search Bar state
  const [upperLocationQuery, setUpperLocationQuery] = useState('');
  const [searchingLocation, setSearchingLocation] = useState(false);

  // Live Location Sharing to Permitted Favourites
  const [isSharingLiveGps, setIsSharingLiveGps] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Directions & Route Polyline state
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING'>('WALKING');
  const [activeRouteSummary, setActiveRouteSummary] = useState<{
    destinationName: string;
    distanceText: string;
    durationText: string;
  } | null>(null);
  const [safeRouteAdvice, setSafeRouteAdvice] = useState<string | null>(null);
  const [computingRoute, setComputingRoute] = useState(false);
  const polylinesRef = useRef<
    {
      setMap: (m: unknown) => void;
      setOptions: (opts: Record<string, unknown>) => void;
    }[]
  >([]);

  const [category, setCategory] = useState<FacilityCategory>('all_medical');
  const [radiusMeters, setRadiusMeters] = useState<number>(3500);
  const [floatingFilterText, setFloatingFilterText] = useState<string>('');
  const [results, setResults] = useState<NearbyDoctorResult[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const permittedFavourites = useMemo(
    () =>
      familyContacts.filter(
        (c) => c.isFavourite !== false && c.allowLiveLocation !== false
      ),
    [familyContacts]
  );

  const clearRoutePolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    setActiveRouteSummary(null);
    setSafeRouteAdvice(null);
  }, []);

  useEffect(() => {
    return () => {
      clearRoutePolylines();
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [clearRoutePolylines]);

  const checkQuotaError = (err: unknown) => {
    const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
    if (
      msg.includes('OVER_QUERY_LIMIT') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('QuotaExceededError') ||
      msg.includes('429')
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };

  // Modern Routes Library: Route.computeRoutes + createPolylines
  const computeDirectionsToPlace = useCallback(
    async (
      target: NearbyDoctorResult,
      modeOverride?: 'WALKING' | 'DRIVING',
      originOverride?: LatLngCoords
    ) => {
      const RouteClass = (routesLib as unknown as { Route?: { computeRoutes?: (req: unknown) => Promise<{ routes?: unknown[] }> } } | null)?.Route;
      if (!RouteClass || typeof RouteClass.computeRoutes !== 'function' || !map) {
        onShowToast('Routes service is still loading—try again in a moment.');
        return;
      }

      const origin = originOverride || userGpsPos || cameraCenter;
      const chosenMode = modeOverride || travelMode;
      setComputingRoute(true);
      clearRoutePolylines();

      try {
        const res = await RouteClass.computeRoutes({
          origin,
          destination: target.location,
          travelMode: chosenMode,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        const primaryRoute = (res?.routes?.[0] ?? null) as {
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: Parameters<NonNullable<typeof map>['fitBounds']>[0];
          createPolylines?: () => {
            setMap: (m: unknown) => void;
            setOptions: (opts: Record<string, unknown>) => void;
          }[];
        } | null;

        if (!primaryRoute) {
          onShowToast('No direct route found between these points.');
          return;
        }

        if (typeof primaryRoute.createPolylines === 'function') {
          const lines = primaryRoute.createPolylines();
          lines.forEach((pl) => {
            pl.setOptions({
              strokeColor: '#D4AF37',
              strokeOpacity: 0.95,
              strokeWeight: 5,
            });
            pl.setMap(map);
          });
          polylinesRef.current = lines;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 56);
        }

        setActiveRouteSummary({
          destinationName: target.name,
          distanceText:
            formatDistance(primaryRoute.distanceMeters ?? target.distanceMeters) || 'Nearby',
          durationText: formatDurationMillis(primaryRoute.durationMillis) || 'Direct path',
        });
        setSelectedPlaceId(target.id);
        onShowToast(`Showing ${chosenMode.toLowerCase()} directions to ${target.name}`);

        apiFetch('/api/safe-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`,
            to: `${target.name}${target.address ? ` (${target.address})` : ''}`,
            travelMode: chosenMode,
            language: isHi ? 'hi' : 'en',
          }),
        })
          .then((r) => r.json())
          .then((routeData) => {
            if (routeData?.advice) {
              setSafeRouteAdvice(String(routeData.advice));
            }
          })
          .catch(() => {});
      } catch (err) {
        checkQuotaError(err);
        onShowToast('Could not compute live route right now.');
      } finally {
        setComputingRoute(false);
      }
    },
    [routesLib, map, userGpsPos, cameraCenter, travelMode, clearRoutePolylines, onShowToast, isHi]
  );

  // Modern Places API (New): Place.searchNearby
  const executeNearbySearch = useCallback(
    async (
      searchCenter: LatLngCoords,
      activeCategory: FacilityCategory,
      activeRadius: number,
      autoRouteNearestSafeSpot = false
    ) => {
      if (!placesLib) return;
      const { Place, SearchNearbyRankPreference } = placesLib;
      if (!Place || typeof Place.searchNearby !== 'function') {
        setSearchError('Places service is still initializing. Please try again in a moment.');
        return;
      }

      setLoadingPlaces(true);
      setSearchError(null);

      const filterMeta =
        FACILITY_FILTERS.find((f) => f.id === activeCategory) || FACILITY_FILTERS[0];

      try {
        const response = await Place.searchNearby({
          fields: [
            'id',
            'displayName',
            'location',
            'formattedAddress',
            'nationalPhoneNumber',
            'internationalPhoneNumber',
            'rating',
            'userRatingCount',
            'googleMapsURI',
          ],
          locationRestriction: {
            center: searchCenter,
            radius: activeRadius,
          },
          includedPrimaryTypes: filterMeta.primaryTypes,
          maxResultCount: 10,
          rankPreference: SearchNearbyRankPreference?.DISTANCE,
        });

        const rawPlaces = (response?.places ?? []) as RawPlaceItem[];
        const mapped: NearbyDoctorResult[] = rawPlaces
          .map((p: RawPlaceItem): NearbyDoctorResult | null => {
            const loc = p.location;
            if (!loc) return null;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const coords = { lat, lng };
            return {
              id: p.id || `${lat},${lng}`,
              name: p.displayName || 'Safe Sanctuary Spot',
              address: p.formattedAddress || '',
              phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
              rating: typeof p.rating === 'number' ? p.rating : null,
              userRatingCount:
                typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
              googleMapsURI: p.googleMapsURI || null,
              location: coords,
              distanceMeters: computeHaversineMeters(searchCenter, coords),
              isPublicSafeSpot: activeCategory === 'public_safe_spots',
            };
          })
          .filter((item: NearbyDoctorResult | null): item is NearbyDoctorResult => item !== null)
          .sort((a, b) => (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999));

        setResults(mapped);
        if (mapped.length > 0) {
          setSelectedPlaceId(mapped[0].id);
          if (autoRouteNearestSafeSpot) {
            void computeDirectionsToPlace(mapped[0], 'WALKING', searchCenter);
          }
        } else {
          setSelectedPlaceId(null);
        }
      } catch (err: unknown) {
        checkQuotaError(err);
        setSearchError(
          'Unable to load nearby locations right now. Try adjusting the radius or searching again.'
        );
      } finally {
        setLoadingPlaces(false);
      }
    },
    [placesLib, computeDirectionsToPlace]
  );

  // Upper Search Bar: Place.searchByText to jump to any location / city / landmark
  const handleUpperLocationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = upperLocationQuery.trim();
    if (!q || !placesLib) return;
    const PlaceAny = placesLib.Place as unknown as {
      searchByText?: (req: unknown) => Promise<{ places?: RawPlaceItem[] }>;
    };
    if (!PlaceAny || typeof PlaceAny.searchByText !== 'function') return;

    setSearchingLocation(true);
    try {
      const res = await PlaceAny.searchByText({
        textQuery: q,
        fields: ['id', 'displayName', 'location', 'formattedAddress'],
        maxResultCount: 4,
      });
      const first = res?.places?.[0];
      if (first?.location) {
        const lat =
          typeof first.location.lat === 'function'
            ? first.location.lat()
            : Number(first.location.lat);
        const lng =
          typeof first.location.lng === 'function'
            ? first.location.lng()
            : Number(first.location.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const targetCenter = { lat, lng };
          setCameraCenter(targetCenter);
          setCameraZoom(15);
          map?.panTo(targetCenter);
          map?.setZoom(15);
          clearRoutePolylines();
          void executeNearbySearch(targetCenter, category, radiusMeters);
          onShowToast(`Moved GPS map to ${first.displayName || q}`);
        }
      } else {
        onShowToast(`No place matched "${q}". Try a city, landmark, or area name.`);
      }
    } catch (err) {
      checkQuotaError(err);
      onShowToast('Location search unavailable right now.');
    } finally {
      setSearchingLocation(false);
    }
  };

  // 1-Tap Nearest Crowded Public Safe Spot Finder
  const handleFindNearestPublicSafeSpot = () => {
    setCategory('public_safe_spots');
    if (navigator.geolocation && !userGpsPos) {
      setGpsStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserGpsPos(coords);
          setGpsStatus('active');
          setCameraCenter(coords);
          map?.panTo(coords);
          void executeNearbySearch(coords, 'public_safe_spots', radiusMeters, true);
        },
        () => {
          setGpsStatus('idle');
          void executeNearbySearch(cameraCenter, 'public_safe_spots', radiusMeters, true);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      const anchor = userGpsPos || cameraCenter;
      void executeNearbySearch(anchor, 'public_safe_spots', radiusMeters, true);
    }
  };

  // Start / Stop Live GPS Sharing with Permitted Favourites
  const handleToggleLiveSharingSession = () => {
    if (isSharingLiveGps) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsSharingLiveGps(false);
      onShowToast('Stopped live GPS location sharing');
      return;
    }

    if (!liveLocationPermitted) {
      onShowToast('Grant Live Location Permission first using the switch on the right.');
      return;
    }

    if (!navigator.geolocation) {
      setGpsStatus('denied');
      setGpsErrorMsg('Browser Geolocation is not supported on this device.');
      return;
    }

    setGpsStatus('locating');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGpsPos(coords);
        setGpsStatus('active');
        setCameraCenter(coords);
        apiFetch('/api/location/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: coords.lat,
            lng: coords.lng,
            active: true,
            permittedCount: permittedFavourites.length,
          }),
        }).catch(() => {});
      },
      () => {
        setGpsStatus('denied');
        setIsSharingLiveGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    watchIdRef.current = id;
    setIsSharingLiveGps(true);
    onShowToast(
      `Live GPS sharing active for ${permittedFavourites.length} permitted Favourite contact${
        permittedFavourites.length === 1 ? '' : 's'
      }`
    );
  };

  useEffect(() => {
    if (!placesLib) return;
    const anchor = userGpsPos || INITIAL_FALLBACK_CENTER;
    void executeNearbySearch(anchor, category, radiusMeters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, category, radiusMeters]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      setGpsErrorMsg('Browser Geolocation is not supported on this device.');
      return;
    }

    setGpsStatus('locating');
    setGpsErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: LatLngCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserGpsPos(coords);
        setGpsStatus('active');
        setCameraCenter(coords);
        setCameraZoom(15);
        map?.panTo(coords);
        map?.setZoom(15);
        void executeNearbySearch(coords, category, radiusMeters);
        onShowToast(
          isHi
            ? 'आपकी लाइव GPS लोकेशन के पास स्थान खोजे गए'
            : 'Located nearby clinics & safe sanctuaries around your live GPS'
        );
      },
      (err) => {
        setGpsStatus('denied');
        setGpsErrorMsg(
          err.code === 1
            ? 'Location permission was declined. Allow location access in your browser or search any area above.'
            : 'Could not read GPS signal right now. Search your neighborhood in the upper search bar.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleShareDoctor = async (doc: NearbyDoctorResult) => {
    const mapLink =
      doc.googleMapsURI ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${doc.name} ${doc.address}`
      )}`;
    const shareLines = [
      `Nearby Sanctuary / Clinic: ${doc.name}`,
      doc.address ? `Address: ${doc.address}` : null,
      doc.phone ? `Phone: ${doc.phone}` : null,
      `Google Maps Location: ${mapLink}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: doc.name, text: shareLines, url: mapLink });
        onShowToast(`Shared ${doc.name}`);
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    navigator.clipboard?.writeText(shareLines).catch(() => {});
    onShowToast(`Copied ${doc.name} location & details to share`);
  };

  const displayedResults = useMemo(() => {
    const q = floatingFilterText.trim().toLowerCase();
    if (!q) return results;
    return results.filter((doc) =>
      `${doc.name} ${doc.address} ${doc.phone || ''}`.toLowerCase().includes(q)
    );
  }, [results, floatingFilterText]);

  const selectedDoctor =
    displayedResults.find((r) => r.id === selectedPlaceId) ||
    results.find((r) => r.id === selectedPlaceId) ||
    null;

  const liveMapsShareUrl = userGpsPos
    ? `https://www.google.com/maps?q=${userGpsPos.lat},${userGpsPos.lng}`
    : `https://www.google.com/maps?q=${cameraCenter.lat},${cameraCenter.lng}`;

  const smsFavNumbers = permittedFavourites
    .map((f) => f.phone.replace(/\s+/g, ''))
    .filter(Boolean)
    .join(',');

  const smsLiveLocationHref = `sms:${smsFavNumbers}?body=${encodeURIComponent(
    `Saevy Live Location Share — Follow my live GPS pin here: ${liveMapsShareUrl}`
  )}`;

  return (
    <div className="space-y-5">
      {/* 1. UPPER LOCATION SEARCH BAR + NEAREST PUBLIC SAFE SPOT BUTTON */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <form
          onSubmit={handleUpperLocationSearch}
          className="lg:col-span-8 flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] shadow-[0_6px_24px_rgba(0,0,0,0.06)]"
        >
          <span className="material-symbols-outlined text-[20px] text-[#D4AF37] pl-3">
            travel_explore
          </span>
          <input
            type="search"
            value={upperLocationQuery}
            onChange={(e) => setUpperLocationQuery(e.target.value)}
            placeholder={
              isHi
                ? 'कोई भी स्थान, मेट्रो स्टेशन, शहर या इलाका खोजें...'
                : 'Search any location, street, metro station, or neighborhood...'
            }
            aria-label="Search location on GPS map"
            className="flex-1 min-w-[150px] min-h-[42px] px-2 bg-transparent text-xs sm:text-sm text-[#0A0A0A] focus:outline-none"
          />
          <button
            type="submit"
            disabled={searchingLocation}
            className="btn-luxury px-5 text-xs font-medium shrink-0"
          >
            {searchingLocation ? 'Searching...' : isHi ? 'स्थान खोजें' : 'Search Location'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleFindNearestPublicSafeSpot}
          className="lg:col-span-4 min-h-[52px] px-5 rounded-full bg-gradient-to-r from-[#1F1830] to-[#2B2142] text-[#F5EFE6] border border-[#D4AF37] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(212,175,55,0.18)] active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[19px] text-[#D4AF37]">
            shield_pin
          </span>
          <span>
            {isHi ? 'सबसे पास सुरक्षित सार्वजनिक स्थान' : 'Nearest Public Safe Spot + Route'}
          </span>
        </button>
      </div>

      {/* 2. SHARE MY LIVE LOCATION WITH PERMITTED FAVOURITES */}
      <div className="luxury-card-sage p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">
              share_location
            </span>
            <h4 className="font-display font-bold text-base sm:text-lg text-[#0A0A0A]">
              Share My Live Location with Favourite People
            </h4>
            {isSharingLiveGps && (
              <span className="text-xs font-semibold text-[#3E6B4E]">
                · Live GPS Streaming Active
              </span>
            )}
          </div>
          <p className="text-xs text-[#5C544E]">
            Permitted Favourites ({permittedFavourites.length}):{' '}
            <strong className="text-[#0A0A0A]">
              {permittedFavourites.map((f) => f.name).join(', ') || 'Add Favourites in Health'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onToggleLiveLocationPermitted && (
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A] cursor-pointer pr-2">
              <input
                type="checkbox"
                checked={liveLocationPermitted}
                onChange={(e) => onToggleLiveLocationPermitted(e.target.checked)}
                className="w-4 h-4 accent-[#D4AF37]"
              />
              <span>Permit Favourites Access</span>
            </label>
          )}

          <button
            type="button"
            onClick={handleToggleLiveSharingSession}
            className={
              isSharingLiveGps
                ? 'min-h-[44px] px-5 rounded-full bg-[#9E2A3B] text-[#FFFCF8] text-xs font-semibold flex items-center gap-1.5'
                : 'btn-luxury px-5 text-xs font-medium flex items-center gap-1.5'
            }
          >
            <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
              {isSharingLiveGps ? 'stop_circle' : 'my_location'}
            </span>
            <span>{isSharingLiveGps ? 'Stop Live Share' : 'Start Live Location'}</span>
          </button>

          {liveLocationPermitted && permittedFavourites.length > 0 && (
            <a
              href={smsLiveLocationHref}
              className="btn-luxury-outline px-4 text-xs font-medium flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">sms</span>
              <span>Send Live Pin to Favourites</span>
            </a>
          )}
        </div>
      </div>

      {/* 3. Category, Travel Mode & Radius Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {FACILITY_FILTERS.map((f) => {
            const active = category === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setCategory(f.id)}
                className={`min-h-[42px] px-4 rounded-full text-xs font-medium tracking-wide transition-all whitespace-nowrap shrink-0 active:scale-[0.98] ${
                  active
                    ? 'bg-[#0A0A0A] text-[#FFFCF8] border border-[#D4AF37]/60'
                    : 'bg-[#FFFCF8] text-[#5C544E] border border-[#F0E6DC] hover:border-[#D4AF37]/60 hover:text-[#0A0A0A]'
                }`}
              >
                {isHi ? f.labelHi : f.labelEn}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-[#FFFCF8] border border-[#F0E6DC] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTravelMode('WALKING')}
              className={`px-3 py-1.5 rounded-full font-medium ${
                travelMode === 'WALKING' ? 'bg-[#0A0A0A] text-[#FFFCF8]' : 'text-[#5C544E]'
              }`}
            >
              Walk
            </button>
            <button
              type="button"
              onClick={() => setTravelMode('DRIVING')}
              className={`px-3 py-1.5 rounded-full font-medium ${
                travelMode === 'DRIVING' ? 'bg-[#0A0A0A] text-[#FFFCF8]' : 'text-[#5C544E]'
              }`}
            >
              Cab / Drive
            </button>
          </div>

          <select
            aria-label="Search radius"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            className="min-h-[42px] px-4 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#0A0A0A] focus:outline-none focus:border-[#D4AF37] tabular-nums"
          >
            <option value={2000}>Within 2 km</option>
            <option value={3500}>Within 3.5 km</option>
            <option value={7000}>Within 7 km</option>
            <option value={15000}>Within 15 km</option>
          </select>
        </div>
      </div>

      {/* Active Directions Route Banner */}
      {activeRouteSummary && (
        <div className="luxury-card p-3.5 px-5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">route</span>
              <span>
                Directions to <strong className="text-[#0A0A0A]">{activeRouteSummary.destinationName}</strong>:{' '}
                <strong className="text-[#D4AF37]">{activeRouteSummary.durationText}</strong> (
                {activeRouteSummary.distanceText})
              </span>
            </div>
            <button
              type="button"
              onClick={clearRoutePolylines}
              className="underline text-[#5C544E] hover:text-[#0A0A0A]"
            >
              Clear Route
            </button>
          </div>
          {safeRouteAdvice && (
            <p className="text-xs text-[#5C544E] leading-relaxed border-t border-[#F0E6DC] pt-2">
              {safeRouteAdvice}
            </p>
          )}
        </div>
      )}

      {gpsErrorMsg && (
        <div className="luxury-card-blush px-5 py-3.5 text-xs text-[#0A0A0A] leading-relaxed">
          {gpsErrorMsg}
        </div>
      )}

      {(apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE) && (
        <div className="luxury-card-blush px-5 py-3.5 text-xs text-[#9E2A3B]">
          Unable to initialize Google Maps right now. Verify network connectivity or API key configuration.
        </div>
      )}

      {/* Split Layout: Rounded 28px Map Card + Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 w-full h-[440px] sm:h-[510px] rounded-[28px] overflow-hidden border border-[#F0E6DC] bg-[#FFFCF8] relative">
          {/* Floating Filter & Live GPS Bar */}
          <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex flex-wrap sm:flex-nowrap items-center gap-2 p-1.5 rounded-full bg-[#FFFCF8]/92 backdrop-blur-xl border border-[#F0E6DC] shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            <span className="material-symbols-outlined text-[18px] text-[#D4AF37] pl-3 shrink-0">
              filter_list
            </span>
            <input
              type="search"
              value={floatingFilterText}
              onChange={(e) => setFloatingFilterText(e.target.value)}
              placeholder={
                isHi ? 'पिन फ़िल्टर करें...' : 'Filter pins in this map view...'
              }
              aria-label="Filter clinics on map"
              className="flex-1 min-w-[110px] min-h-[38px] px-1.5 bg-transparent text-xs sm:text-sm text-[#0A0A0A] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={gpsStatus === 'locating'}
              className="min-h-[38px] px-3.5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] text-xs font-medium flex items-center gap-1.5 border border-[#D4AF37]/40 shrink-0 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[16px] text-[#D4AF37]">
                my_location
              </span>
              <span>{gpsStatus === 'locating' ? 'Locating...' : 'My GPS'}</span>
            </button>
            <button
              type="button"
              onClick={() => void executeNearbySearch(cameraCenter, category, radiusMeters)}
              disabled={loadingPlaces}
              className="min-h-[38px] px-3.5 rounded-full bg-[#FAF1E6] text-[#0A0A0A] border border-[#F0E6DC] text-xs font-medium flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] text-[#B76E79]">refresh</span>
              <span className="hidden sm:inline">Search Area</span>
            </button>
          </div>

          <Map
            center={cameraCenter}
            zoom={cameraZoom}
            onCameraChanged={(ev: MapCameraChangedEvent) => {
              setCameraCenter(ev.detail.center);
              setCameraZoom(ev.detail.zoom);
            }}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            clickableIcons={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
          >
            {userGpsPos && (
              <AdvancedMarker position={userGpsPos} title="Your Live GPS Location">
                <Pin
                  background="#B76E79"
                  borderColor="#FFFCF8"
                  glyphColor="#FFFCF8"
                  glyphText="YOU"
                />
              </AdvancedMarker>
            )}

            {displayedResults.map((doc, idx) => {
              const isSelected = doc.id === selectedPlaceId;
              return (
                <AdvancedMarker
                  key={doc.id}
                  position={doc.location}
                  title={doc.name}
                  onClick={() => setSelectedPlaceId(doc.id)}
                  zIndex={isSelected ? 30 : 10}
                >
                  <Pin
                    background={isSelected ? '#D4AF37' : '#0A0A0A'}
                    borderColor="#D4AF37"
                    glyphColor={isSelected ? '#0A0A0A' : '#D4AF37'}
                    glyphText={String(idx + 1)}
                    scale={isSelected ? 1.16 : 1}
                  />
                </AdvancedMarker>
              );
            })}

            {selectedDoctor && (
              <InfoWindow
                position={selectedDoctor.location}
                onCloseClick={() => setSelectedPlaceId(null)}
              >
                <div className="max-w-[240px] text-[#0A0A0A] space-y-2 p-1 font-sans">
                  <div className="font-display font-bold text-sm leading-snug">
                    {selectedDoctor.name}
                  </div>
                  {selectedDoctor.address && (
                    <div className="text-xs text-[#5C544E] leading-snug">
                      {selectedDoctor.address}
                    </div>
                  )}
                  <div className="text-xs text-[#8C6D1F] font-medium tabular-nums">
                    {selectedDoctor.rating !== null && (
                      <span>★ {selectedDoctor.rating.toFixed(1)} · </span>
                    )}
                    {formatDistance(selectedDoctor.distanceMeters)}
                  </div>
                  <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={computingRoute}
                      onClick={() => void computeDirectionsToPlace(selectedDoctor)}
                      className="px-3 py-1.5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] text-xs font-medium"
                    >
                      {computingRoute ? 'Routing...' : 'Directions'}
                    </button>
                    {selectedDoctor.phone && (
                      <a
                        href={`tel:${selectedDoctor.phone}`}
                        className="px-3 py-1.5 rounded-full bg-[#FAF1E6] border border-[#D4AF37]/40 text-[#0A0A0A] text-xs font-medium"
                      >
                        Call
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleShareDoctor(selectedDoctor)}
                      className="px-2.5 py-1.5 rounded-full border border-[#D4AF37]/40 text-[#0A0A0A] text-xs"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </div>

        {/* Right List: Directory with In-App Directions, Call & Share */}
        <div className="lg:col-span-5 luxury-card p-5 flex flex-col justify-between max-h-[510px]">
          <div className="pb-3 border-b border-[#F0E6DC]">
            <h3 className="font-display text-lg font-bold text-[#0A0A0A]">
              {category === 'public_safe_spots'
                ? 'Nearest Crowded Public Safe Spots'
                : 'Verified Clinics & Sanctuaries'}
            </h3>
            <p className="text-xs text-[#5C544E] mt-0.5">
              {loadingPlaces
                ? 'Discovering nearby places...'
                : `${displayedResults.length} locations · Tap Directions for live route on map`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
            {searchError && <div className="text-xs text-[#9E2A3B] py-2">{searchError}</div>}

            {!loadingPlaces && !searchError && displayedResults.length === 0 && (
              <div className="py-10 text-center text-xs text-[#5C544E] space-y-2">
                <p>No matching places found within this radius.</p>
                <p>Search any location in the upper bar or widen the radius.</p>
              </div>
            )}

            {displayedResults.map((doc, idx) => {
              const active = doc.id === selectedPlaceId;
              const distText = formatDistance(doc.distanceMeters);
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    setSelectedPlaceId(doc.id);
                    setCameraCenter(doc.location);
                    map?.panTo(doc.location);
                  }}
                  className={`rounded-[20px] p-4 border transition-all cursor-pointer space-y-2.5 ${
                    active
                      ? 'bg-[#FAF3EB] border-[#D4AF37]'
                      : 'bg-[#FFFCF8] border-[#F0E6DC] hover:border-[#D4AF37]/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[#0A0A0A] leading-snug">
                        <span className="text-[#D4AF37] font-bold tabular-nums mr-1.5">
                          0{idx + 1}.
                        </span>
                        {doc.name}
                      </h4>
                      {distText && (
                        <span className="text-[11px] text-[#8C6D1F] font-medium tabular-nums shrink-0">
                          {distText}
                        </span>
                      )}
                    </div>
                    {doc.address && (
                      <p className="text-xs text-[#5C544E] leading-snug">{doc.address}</p>
                    )}
                  </div>

                  <div
                    className="pt-2 border-t border-[#F0E6DC] flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={computingRoute}
                      onClick={() => void computeDirectionsToPlace(doc)}
                      className="min-h-[38px] px-3.5 rounded-full bg-[#0A0A0A] text-[#FFFCF8] text-xs font-medium flex items-center gap-1.5 border border-[#D4AF37]/50"
                    >
                      <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">
                        directions
                      </span>
                      <span>Directions</span>
                    </button>

                    {doc.phone && (
                      <a
                        href={`tel:${doc.phone}`}
                        className="min-h-[38px] px-3.5 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#0A0A0A] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[15px] text-[#D4AF37]">
                          call
                        </span>
                        <span>Call</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleShareDoctor(doc)}
                      className="min-h-[38px] px-3 rounded-full bg-[#FFFCF8] border border-[#F0E6DC] text-xs font-medium text-[#0A0A0A] flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px] text-[#B76E79]">
                        share
                      </span>
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#F0E6DC] text-[11px] text-[#5C544E] leading-relaxed flex flex-wrap items-center justify-between gap-2">
            <span>
              Dial <strong>112</strong> or <strong>108</strong> for emergency dispatch.
            </span>
            <span className="shrink-0">
              <a
                href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[#0A0A0A]"
              >
                Google Maps Terms
              </a>
              {' · '}
              <a
                href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[#0A0A0A]"
              >
                Privacy
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface NearbyDoctorsMapProps {
  isHi: boolean;
  familyContacts?: FamilyEmergencyContact[];
  liveLocationPermitted?: boolean;
  onToggleLiveLocationPermitted?: (next: boolean) => void;
  onShowToast: (msg: string) => void;
}

export const NearbyDoctorsMap: React.FC<NearbyDoctorsMapProps> = ({
  isHi,
  familyContacts = [],
  liveLocationPermitted = true,
  onToggleLiveLocationPermitted,
  onShowToast,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!apiKey) {
    return (
      <div className="luxury-card p-6 text-xs sm:text-sm text-[#5C544E]">
        Google Maps API key is not configured in environment variables (
        <code>VITE_GOOGLE_MAPS_API_KEY</code>).
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['places', 'marker', 'routes']}
      language={isHi ? 'hi' : 'en'}
      region="IN"
    >
      <InnerNearbyDoctorsWorkspace
        isHi={isHi}
        familyContacts={familyContacts}
        liveLocationPermitted={liveLocationPermitted}
        onToggleLiveLocationPermitted={onToggleLiveLocationPermitted}
        onShowToast={onShowToast}
      />
    </APIProvider>
  );
};
