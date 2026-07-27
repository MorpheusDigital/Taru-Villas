export type ManifestLanguage = 'en' | 'si' | 'ta'

export interface ManifestStrings {
  todaysTrip: string
  upcomingTrips: string
  noTrips: string
  startTrip: string
  arrived: string
  arrivedAt: string
  completeTrip: string
  vehicle: string
  passengers: string
  cargo: string
  stops: string
  inProgress: string
  enableNotifications: string
  notificationsOn: string
  setupTitle: string
  setupStep1: string
  setupStep2: string
  setupStep3: string
  loading: string
  loadError: string
  retry: string
  draftNotice: string
}

/**
 * SI and TA are first-pass drafts pending native-speaker review. Correcting
 * them is a data edit here — no component changes required.
 */
export const MANIFEST_STRINGS: Record<ManifestLanguage, ManifestStrings> = {
  en: {
    todaysTrip: "Today's trip",
    upcomingTrips: 'Upcoming trips',
    noTrips: 'No trips assigned',
    startTrip: 'Start trip',
    arrived: 'Arrived',
    arrivedAt: 'Arrived at',
    completeTrip: 'Complete trip',
    vehicle: 'Vehicle',
    passengers: 'Passengers',
    cargo: 'Cargo',
    stops: 'Stops',
    inProgress: 'In progress',
    enableNotifications: 'Turn on trip alerts',
    notificationsOn: 'Trip alerts are on',
    setupTitle: 'Get trip alerts on this phone',
    setupStep1: 'Open this page in Chrome (not inside WhatsApp)',
    setupStep2: 'Tap the menu and choose "Add to Home screen"',
    setupStep3: 'Tap Allow when asked about notifications',
    loading: 'Loading…',
    loadError: 'Could not load your trips',
    retry: 'Try again',
    draftNotice: 'Sinhala and Tamil wording is a draft pending review.',
  },
  si: {
    todaysTrip: 'අද ගමන',
    upcomingTrips: 'ඉදිරි ගමන්',
    noTrips: 'ගමන් පවරා නැත',
    startTrip: 'ගමන අරඹන්න',
    arrived: 'පැමිණියා',
    arrivedAt: 'පැමිණි වේලාව',
    completeTrip: 'ගමන අවසන් කරන්න',
    vehicle: 'වාහනය',
    passengers: 'මගීන්',
    cargo: 'බඩු',
    stops: 'නැවතුම්',
    inProgress: 'ගමනේ යෙදී සිටී',
    enableNotifications: 'ගමන් දැනුම්දීම් සක්‍රීය කරන්න',
    notificationsOn: 'ගමන් දැනුම්දීම් සක්‍රීයයි',
    setupTitle: 'මෙම දුරකථනයෙන් ගමන් දැනුම්දීම් ලබාගන්න',
    setupStep1: 'මෙම පිටුව Chrome තුළ විවෘත කරන්න (WhatsApp තුළ නොවේ)',
    setupStep2: 'මෙනුව තට්ටු කර "Add to Home screen" තෝරන්න',
    setupStep3: 'දැනුම්දීම් ගැන විමසූ විට Allow තට්ටු කරන්න',
    loading: 'පූරණය වෙමින්…',
    loadError: 'ඔබගේ ගමන් පූරණය කළ නොහැකි විය',
    retry: 'නැවත උත්සාහ කරන්න',
    draftNotice: 'සිංහල හා දෙමළ පරිවර්තන සමාලෝචනය අපේක්ෂාවෙන් පවතී.',
  },
  ta: {
    todaysTrip: 'இன்றைய பயணம்',
    upcomingTrips: 'வரவிருக்கும் பயணங்கள்',
    noTrips: 'பயணங்கள் ஒதுக்கப்படவில்லை',
    startTrip: 'பயணத்தைத் தொடங்கு',
    arrived: 'வந்துவிட்டேன்',
    arrivedAt: 'வந்த நேரம்',
    completeTrip: 'பயணத்தை முடி',
    vehicle: 'வாகனம்',
    passengers: 'பயணிகள்',
    cargo: 'சரக்கு',
    stops: 'நிறுத்தங்கள்',
    inProgress: 'பயணத்தில்',
    enableNotifications: 'பயண அறிவிப்புகளை இயக்கு',
    notificationsOn: 'பயண அறிவிப்புகள் இயக்கத்தில்',
    setupTitle: 'இந்தத் தொலைபேசியில் பயண அறிவிப்புகளைப் பெறுங்கள்',
    setupStep1: 'இந்தப் பக்கத்தை Chrome இல் திறக்கவும் (WhatsApp இல் அல்ல)',
    setupStep2: 'மெனுவைத் தட்டி "Add to Home screen" என்பதைத் தேர்வுசெய்க',
    setupStep3: 'அறிவிப்புகள் பற்றி கேட்கும்போது Allow என்பதைத் தட்டவும்',
    loading: 'ஏற்றுகிறது…',
    loadError: 'உங்கள் பயணங்களை ஏற்ற முடியவில்லை',
    retry: 'மீண்டும் முயற்சிக்கவும்',
    draftNotice: 'சிங்களம் மற்றும் தமிழ் மொழிபெயர்ப்புகள் மதிப்பாய்வுக்கு உட்பட்டவை.',
  },
}
