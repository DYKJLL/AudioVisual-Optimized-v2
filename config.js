// config.js - AudioVisual Configuration Constants

module.exports = {
    // View Pool Configuration
    VIEW_POOL: {
        MAX_SIZE: 3,
        ESTIMATED_MEMORY_PER_VIEW: '150-300MB'
    },
    
    // Timeout Configuration (milliseconds)
    TIMEOUTS: {
        PRELOAD_DEFAULT: 8000,
        DRAMA_SITE_DEFAULT: 15000,
        HEAVY_SITE: 30000,
        LOAD_FINISHED: 15000,
        UPDATE_CHECK: 30000
    },
    
    // Interval Configuration (milliseconds)
    INTERVALS: {
        INJECTION_GUARDIAN_INITIAL: 200,
        INJECTION_GUARDIAN_AFTER_5S: 500,
        INJECTION_GUARDIAN_SWITCH_TIME: 5000,
        ZOOM_UPDATE_DEBOUNCE: 150,
        WINDOW_STATE_SAVE_DEBOUNCE: 500,
        PRELOAD_DELAY: 100,
        NAVIGATE_DELAY: 500,
        SHOW_WINDOW_DELAY: 100,
        FAST_PARSE_HIDE_OVERLAY: 1500
    },
    
    // Security Configuration
    SECURITY: {
        ALLOWED_EXTERNAL_PROTOCOLS: ['http:', 'https:'],
        WIDEVINE_PATHS: {
            win32: (homedir) => `${homedir()}/AppData/Local/Google/Chrome/User Data/WidevineCdm`,
            darwin: (homedir) => `${homedir()}/Library/Application Support/Google/Chrome/WidevineCdm`,
            linux: (homedir) => `${homedir()}/.config/google-chrome/WidevineCdm`
        }
    },
    
    // Zoom Configuration
    ZOOM: {
        IDEAL_WIDTH: 1400
    },
    
    // Sidebar Configuration
    SIDEBAR: {
        MIN_WIDTH: 200,
        MAX_WIDTH: 280,
        WIDTH_PERCENT: 0.18
    },
    
    // Top Bar Configuration
    TOP_BAR: {
        MIN_HEIGHT: 50,
        MAX_HEIGHT: 65,
        HEIGHT_PERCENT: 0.07
    },
    
    // UI Configuration
    UI: {
        INITIAL_WIDTH_PERCENT: 0.8,
        INITIAL_HEIGHT_PERCENT: 0.85,
        INITIAL_WIDTH_MAX: 1440,
        INITIAL_HEIGHT_MAX: 1000,
        MIN_WIDTH: 940,
        MIN_HEIGHT: 620
    },
    
    // Cache Configuration
    CACHE: {
        VALID_DURATION: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // Platform Home Pages
    PLATFORM_HOME_PAGES: [
        'https://v.qq.com',
        'https://www.iqiyi.com',
        'https://www.youku.com',
        'https://www.bilibili.com',
        'https://www.mgtv.com'
    ],
    
    // Drama Sites Default Configuration
    DRAMA_SITES: [
        { url: 'https://monkey-flix.com/', name: '猴影工坊', timeout: 15000, retry: 2 },
        { url: 'https://www.movie1080.xyz/', name: '影巢movie', timeout: 20000, retry: 3 },
        { url: 'https://www.letu.me/', name: '茉小影', timeout: 15000, retry: 2 },
        { url: 'https://www.ncat21.com/', name: '网飞猫', timeout: 15000, retry: 2 }
    ],
    
    // Heavy Sites (need longer timeout)
    HEAVY_SITES: ['movie1080', 'monkey-flix'],
    
    // Preload Priority Sites Count
    PRELOAD_PRIORITY_COUNT: 3
};
