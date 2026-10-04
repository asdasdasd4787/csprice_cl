<?php
declare(strict_types=1);

$config = [
    'db' => [
        'driver' => getenv('CSGO_DB_DRIVER') ?: 'mysql',
        'dsn' => getenv('CSGO_DB_DSN') ?: '',
        'host' => getenv('CSGO_DB_HOST') ?: 'localhost',
        'port' => getenv('CSGO_DB_PORT') !== false ? (int)getenv('CSGO_DB_PORT') : null,
        'username' => getenv('CSGO_DB_USER') ?: 'root',
        'password' => getenv('CSGO_DB_PASS') ?: '',
        'database' => getenv('CSGO_DB_NAME') ?: 'csgo_price_tracker',
        'encrypt' => getenv('CSGO_DB_ENCRYPT') !== false ? filter_var(getenv('CSGO_DB_ENCRYPT'), FILTER_VALIDATE_BOOL) : true,
        'trust_server_certificate' => getenv('CSGO_DB_TRUST_CERT') !== false ? filter_var(getenv('CSGO_DB_TRUST_CERT'), FILTER_VALIDATE_BOOL) : false,
    ],
    'market_data_db' => [
        'driver' => getenv('CSGO_MARKET_DB_DRIVER') ?: getenv('CSGO_AZURE_SQL_DRIVER') ?: '',
        'dsn' => getenv('CSGO_MARKET_DB_DSN') ?: getenv('CSGO_AZURE_SQL_DSN') ?: '',
        'host' => getenv('CSGO_MARKET_DB_HOST') ?: getenv('CSGO_AZURE_SQL_HOST') ?: '',
        'port' => getenv('CSGO_MARKET_DB_PORT') !== false
            ? (int)getenv('CSGO_MARKET_DB_PORT')
            : (getenv('CSGO_AZURE_SQL_PORT') !== false ? (int)getenv('CSGO_AZURE_SQL_PORT') : null),
        'username' => getenv('CSGO_MARKET_DB_USER') ?: getenv('CSGO_AZURE_SQL_USER') ?: '',
        'password' => getenv('CSGO_MARKET_DB_PASS') ?: getenv('CSGO_AZURE_SQL_PASS') ?: '',
        'database' => getenv('CSGO_MARKET_DB_NAME') ?: getenv('CSGO_AZURE_SQL_NAME') ?: '',
        'encrypt' => getenv('CSGO_MARKET_DB_ENCRYPT') !== false
            ? filter_var(getenv('CSGO_MARKET_DB_ENCRYPT'), FILTER_VALIDATE_BOOL)
            : (getenv('CSGO_AZURE_SQL_ENCRYPT') !== false
                ? filter_var(getenv('CSGO_AZURE_SQL_ENCRYPT'), FILTER_VALIDATE_BOOL)
                : true),
        'trust_server_certificate' => getenv('CSGO_MARKET_DB_TRUST_CERT') !== false
            ? filter_var(getenv('CSGO_MARKET_DB_TRUST_CERT'), FILTER_VALIDATE_BOOL)
            : (getenv('CSGO_AZURE_SQL_TRUST_CERT') !== false
                ? filter_var(getenv('CSGO_AZURE_SQL_TRUST_CERT'), FILTER_VALIDATE_BOOL)
                : false),
    ],
    'steam_cache' => [
        'profile_ttl_seconds' => (int)(getenv('STEAM_PROFILE_CACHE_TTL') ?: 21600),
        'inventory_ttl_seconds' => (int)(getenv('STEAM_INVENTORY_CACHE_TTL') ?: 1800),
        'page_size' => (int)(getenv('STEAM_INVENTORY_PAGE_SIZE') ?: 200),
        'max_pages' => (int)(getenv('STEAM_INVENTORY_MAX_PAGES') ?: 50),
    ],
    'steamanalyst' => [
        'base_url' => getenv('STEAMANALYST_BASE_URL') ?: 'https://api.steamanalyst.com',
        'api_key' => getenv('STEAMANALYST_API_KEY') ?: '',
        'timeout_seconds' => (int)(getenv('STEAMANALYST_TIMEOUT') ?: 20),
        'wears' => [
            'Factory New',
            'Minimal Wear',
            'Field-Tested',
            'Well-Worn',
            'Battle-Scarred',
        ],
    ],
    'csfloat' => [
        'base_url' => getenv('CSFLOAT_BASE_URL') ?: 'https://csfloat.com',
        'api_key' => getenv('CSFLOAT_API_KEY') ?: '',
        'timeout_seconds' => (int)(getenv('CSFLOAT_TIMEOUT') ?: 20),
        'limit' => (int)(getenv('CSFLOAT_LIMIT') ?: 50),
        'sort_by' => getenv('CSFLOAT_SORT_BY') ?: 'lowest_price',
        'listing_type' => getenv('CSFLOAT_TYPE') ?: 'buy_now',
        'category' => (int)(getenv('CSFLOAT_CATEGORY') ?: 1),
        'default_fee_pct' => (float)(getenv('CSFLOAT_FEE_PCT') ?: 2.5),
        'wears' => [
            'Factory New',
            'Minimal Wear',
            'Field-Tested',
            'Well-Worn',
            'Battle-Scarred',
        ],
    ],
    'steam_web' => [
        'api_key' => getenv('STEAM_WEB_API_KEY') ?: '',
    ],
    // Logged-in Steam Community session. /market/pricehistory/ (the only
    // source for an item's true full lifetime price history) returns
    // {"success":false} to anonymous requests — this is required to get
    // more than the short public-listing-page snippet. Expires/rotates
    // periodically like any session cookie; refresh here when it does.
    'steam_session' => [
        'login_secure' => getenv('STEAM_LOGIN_SECURE') ?: '',
    ],
    'skinport' => [
        'base_url' => getenv('SKINPORT_BASE_URL') ?: 'https://api.skinport.com',
        'client_id' => getenv('SKINPORT_CLIENT_ID') ?: '',
        'client_secret' => getenv('SKINPORT_CLIENT_SECRET') ?: '',
        'app_id' => (int)(getenv('SKINPORT_APP_ID') ?: 730),
        'currency' => getenv('SKINPORT_CURRENCY') ?: 'EUR',
        'tradable' => (int)(getenv('SKINPORT_TRADABLE') ?: 1),
        'timeout_seconds' => (int)(getenv('SKINPORT_TIMEOUT') ?: 30),
        'default_fee_pct' => (float)(getenv('SKINPORT_FEE_PCT') ?: 1.0),
        'wears' => [
            'Factory New',
            'Minimal Wear',
            'Field-Tested',
            'Well-Worn',
            'Battle-Scarred',
        ],
    ],
    'white_market' => [
        'export_url' => getenv('WHITE_MARKET_EXPORT_URL') ?: 'https://export.white.market/v1/prices/730.json',
        'partner_token' => getenv('WHITE_MARKET_PARTNER_TOKEN') ?: '',
        'timeout_seconds' => (int)(getenv('WHITE_MARKET_TIMEOUT') ?: 20),
        'cache_ttl_seconds' => (int)(getenv('WHITE_MARKET_CACHE_TTL') ?: 600),
    ],
    'dmarket' => [
        'base_url' => getenv('DMARKET_BASE_URL') ?: 'https://api.dmarket.com',
        'public_key' => getenv('DMARKET_PUBLIC_KEY') ?: '',
        'secret_key' => getenv('DMARKET_SECRET_KEY') ?: '',
        'game_id' => getenv('DMARKET_GAME_ID') ?: 'a8db',
        'currency' => getenv('DMARKET_CURRENCY') ?: 'USD',
        'usd_to_eur' => (float)(getenv('DMARKET_USD_TO_EUR') ?: 0.92),
        'timeout_seconds' => (int)(getenv('DMARKET_TIMEOUT') ?: 20),
        'cache_ttl_seconds' => (int)(getenv('DMARKET_CACHE_TTL') ?: 900),
        'db_cache_ttl_seconds' => (int)(getenv('DMARKET_DB_CACHE_TTL') ?: 86400),
        'miss_ttl_seconds' => (int)(getenv('DMARKET_MISS_TTL') ?: 21600),
        'max_live_requests' => (int)(getenv('DMARKET_MAX_LIVE_REQUESTS') ?: 12),
    ],
    'market_csgo' => [
        'base_url' => getenv('MARKET_CSGO_BASE_URL') ?: 'https://market.csgo.com',
        'api_key' => getenv('MARKET_CSGO_API_KEY') ?: '',
        'currency' => getenv('MARKET_CSGO_CURRENCY') ?: 'EUR',
        'timeout_seconds' => (int)(getenv('MARKET_CSGO_TIMEOUT') ?: 30),
        'cache_ttl_seconds' => (int)(getenv('MARKET_CSGO_CACHE_TTL') ?: 300),
        'history_cache_ttl_seconds' => (int)(getenv('MARKET_CSGO_HISTORY_CACHE_TTL') ?: 1800),
        'default_fee_pct' => (float)(getenv('MARKET_CSGO_FEE_PCT') ?: 5.0),
    ],
    'shadowpay' => [
        'base_url' => getenv('SHADOWPAY_BASE_URL') ?: 'https://api.shadowpay.com',
        'api_token' => getenv('SHADOWPAY_API_TOKEN') ?: '',
        'timeout_seconds' => (int)(getenv('SHADOWPAY_TIMEOUT') ?: 30),
        'cache_ttl_seconds' => (int)(getenv('SHADOWPAY_CACHE_TTL') ?: 300),
        'default_fee_pct' => (float)(getenv('SHADOWPAY_FEE_PCT') ?: 2.0),
        'usd_to_eur' => (float)(getenv('SHADOWPAY_USD_TO_EUR') ?: 0.92),
    ],
    'waxpeer' => [
        'base_url' => getenv('WAXPEER_BASE_URL') ?: 'https://api.waxpeer.com',
        'api_key' => getenv('WAXPEER_API_KEY') ?: '',
        'game' => getenv('WAXPEER_GAME') ?: 'csgo',
        'timeout_seconds' => (int)(getenv('WAXPEER_TIMEOUT') ?: 30),
        'cache_ttl_seconds' => (int)(getenv('WAXPEER_CACHE_TTL') ?: 300),
        'default_fee_pct' => (float)(getenv('WAXPEER_FEE_PCT') ?: 2.0),
        'usd_to_eur' => (float)(getenv('WAXPEER_USD_TO_EUR') ?: 0.92),
    ],
    'mannco' => [
        'base_url' => getenv('MANNCO_BASE_URL') ?: 'https://api.mannco.store',
        'api_key' => getenv('MANNCO_API_KEY') ?: '',
        'game' => (int)(getenv('MANNCO_GAME') ?: 730),
        'timeout_seconds' => (int)(getenv('MANNCO_TIMEOUT') ?: 25),
        // Mannco's bulk endpoint rate-limits aggressively; keep this well above waxpeer/haloskins.
        'cache_ttl_seconds' => (int)(getenv('MANNCO_CACHE_TTL') ?: 1800),
        // Mannco.store takes 5% from the seller (their own listing copy; no fee
        // field is exposed by the API, so it has to be configured).
        'default_fee_pct' => (float)(getenv('MANNCO_FEE_PCT') ?: 5.0),
        'usd_to_eur' => (float)(getenv('MANNCO_USD_TO_EUR') ?: 0.92),
    ],
    'haloskins' => [
        'base_url' => getenv('HALOSKINS_BASE_URL') ?: 'https://api.haloskins.com',
        // Open Platform Trading API key (open.haloskins.com). Does not authorize website listing search.
        'api_key' => getenv('HALOSKINS_API_KEY') ?: '',
        // Website session access_token from www.haloskins.com (not the Trading API key).
        'access_token' => getenv('HALOSKINS_ACCESS_TOKEN') ?: '',
        'app_id' => (int)(getenv('HALOSKINS_APP_ID') ?: 730),
        'timeout_seconds' => (int)(getenv('HALOSKINS_TIMEOUT') ?: 25),
        'cache_ttl_seconds' => (int)(getenv('HALOSKINS_CACHE_TTL') ?: 300),
        'default_fee_pct' => (float)(getenv('HALOSKINS_FEE_PCT') ?: 3.0),
        'usd_to_eur' => (float)(getenv('HALOSKINS_USD_TO_EUR') ?: 0.92),
    ],
    'supabase' => [
        'url'         => getenv('SUPABASE_URL') ?: '',
        'anon_key'    => getenv('SUPABASE_ANON_KEY') ?: '',
        'service_key' => getenv('SUPABASE_SERVICE_KEY') ?: '',
    ],
    'buff163' => [
        'base_url' => getenv('BUFF163_BASE_URL') ?: 'https://buff.163.com',
        'session_cookie' => getenv('BUFF163_SESSION') ?: '',
        'csrf_token' => getenv('BUFF163_CSRF_TOKEN') ?: '',
        'game' => getenv('BUFF163_GAME') ?: 'csgo',
        'timeout_seconds' => (int)(getenv('BUFF163_TIMEOUT') ?: 20),
    ],
    'csgoskins' => [
        'base_url' => getenv('CSGOSKINS_BASE_URL') ?: 'https://csgoskins.gg',
        'api_key' => getenv('CSGOSKINS_API_KEY') ?: '',
    ],
    'ai' => [
        'provider' => getenv('CSGO_AI_PROVIDER') ?: 'openai',
        'api_key' => getenv('CSGO_AI_API_KEY') ?: '',
        // Main answer model. Bigger = better instruction-following and picks.
        'model' => getenv('CSGO_AI_MODEL') ?: 'gpt-5-nano',
        // Throwaway calls (follow-up chips). Keep this small and cheap so
        // upgrading 'model' does not multiply the bill.
        'cheap_model' => getenv('CSGO_AI_CHEAP_MODEL') ?: 'gpt-5-nano',
        // minimal | low | medium | high — only used by reasoning models.
        // Higher means better analysis but a slower first token.
        'reasoning_effort' => getenv('CSGO_AI_REASONING_EFFORT') ?: 'minimal',
        'vision_model' => getenv('CSGO_AI_VISION_MODEL') ?: 'gpt-4.1-mini',
        'base_url' => getenv('CSGO_AI_BASE_URL') ?: 'https://api.openai.com/v1',
        'timeout_seconds' => (int)(getenv('CSGO_AI_TIMEOUT') ?: 30),
        'assistant_name' => getenv('CSGO_AI_ASSISTANT_NAME') ?: 'Mark',
        'transcribe_model' => getenv('CSGO_AI_TRANSCRIBE_MODEL') ?: 'whisper-1',
    ],
    // Giphy Developers → Create App. Key stays server-side (never ship in frontend JS).
    'giphy' => [
        'api_key' => getenv('GIPHY_API_KEY') ?: '',
        'rating' => getenv('GIPHY_RATING') ?: 'pg-13',
    ],
    // Google OAuth 2.0 (Welcome Back modal). Leave blank until you create a Web client.
    // Redirect URI: {site}/google_callback.php
    // Local XAMPP example: http://localhost/csgo_price_tracker/google_callback.php
    'google' => [
        'client_id' => getenv('GOOGLE_CLIENT_ID') ?: '',
        'client_secret' => getenv('GOOGLE_CLIENT_SECRET') ?: '',
        'redirect_uri' => getenv('GOOGLE_REDIRECT_URI') ?: '',
    ],
    // Discord OAuth 2.0 (Welcome Back modal). Leave blank until you create an application.
    // Redirect URI: {site}/discord_callback.php
    // Local XAMPP example: http://localhost/csgo_price_tracker/discord_callback.php
    // Also register the production callback URL in the Discord Developer Portal.
    'discord' => [
        'client_id' => getenv('DISCORD_CLIENT_ID') ?: '',
        'client_secret' => getenv('DISCORD_CLIENT_SECRET') ?: '',
        'redirect_uri' => getenv('DISCORD_REDIRECT_URI') ?: '',
    ],
];

$localConfigPath = __DIR__ . '/config.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $config = array_replace_recursive($config, $localConfig);
    }
}

return $config;
