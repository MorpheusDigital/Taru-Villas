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
  noTripToday: string
  statusUpdateFailed: string
  pushNotConfigured: string
  pushBlocked: string
  pushSaveFailed: string
  pushEnableFailed: string
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
    noTripToday: 'No trip today',
    statusUpdateFailed: 'Could not save. Check your connection and try again.',
    pushNotConfigured: 'Trip alerts are not set up yet. Contact the office.',
    pushBlocked: 'Notifications were turned off. Turn them on in your phone settings and try again.',
    pushSaveFailed: 'Could not save your alert settings. Contact the office.',
    pushEnableFailed: 'Could not turn on trip alerts. Contact the office.',
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
    noTripToday: 'අද ගමනක් නැත',
    statusUpdateFailed: 'සුරැකිය නොහැකි විය. ඔබගේ සම්බන්ධතාවය පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
    pushNotConfigured: 'ගමන් දැනුම්දීම් තවම සකසා නැත. කාර්යාලය අමතන්න.',
    pushBlocked: 'දැනුම්දීම් නවත්වා ඇත. ඔබගේ දුරකථන සැකසුම් වලින් ඒවා සක්‍රීය කර නැවත උත්සාහ කරන්න.',
    pushSaveFailed: 'ඔබගේ දැනුම්දීම් සැකසුම් සුරැකිය නොහැකි විය. කාර්යාලය අමතන්න.',
    pushEnableFailed: 'ගමන් දැනුම්දීම් සක්‍රීය කළ නොහැකි විය. කාර්යාලය අමතන්න.',
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
    noTripToday: 'இன்று பயணம் இல்லை',
    statusUpdateFailed: 'சேமிக்க முடியவில்லை. உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
    pushNotConfigured: 'பயண அறிவிப்புகள் இன்னும் அமைக்கப்படவில்லை. அலுவலகத்தைத் தொடர்பு கொள்ளவும்.',
    pushBlocked: 'அறிவிப்புகள் நிறுத்தப்பட்டன. உங்கள் தொலைபேசி அமைப்புகளில் அவற்றை இயக்கி மீண்டும் முயற்சிக்கவும்.',
    pushSaveFailed: 'உங்கள் அறிவிப்பு அமைப்புகளை சேமிக்க முடியவில்லை. அலுவலகத்தைத் தொடர்பு கொள்ளவும்.',
    pushEnableFailed: 'பயண அறிவிப்புகளை இயக்க முடியவில்லை. அலுவலகத்தைத் தொடர்பு கொள்ளவும்.',
  },
}
