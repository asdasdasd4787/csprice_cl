<?php
declare(strict_types=1);

return [
    'market_data_db' => [
        'driver' => 'sqlsrv',
        'host' => 'your-server.database.windows.net',
        'port' => 1433,
        'username' => 'your-sql-user',
        'password' => 'your-sql-password',
        'database' => 'csgo_price_tracker',
        'encrypt' => true,
        'trust_server_certificate' => false,
    ],
    'steamanalyst' => [
        'api_key' => 'paste-your-steamanalyst-key-here',
    ],
    'csfloat' => [
        'api_key' => 'paste-your-csfloat-key-here',
    ],
    'white_market' => [
        'partner_token' => 'paste-your-white-market-partner-token-here',
    ],
    'dmarket' => [
        'public_key' => 'paste-your-dmarket-public-key-here',
        'secret_key' => 'paste-your-dmarket-secret-key-here',
        'usd_to_eur' => 0.92,
    ],
    'market_csgo' => [
        'api_key' => 'paste-your-market-csgo-api-key-here',
    ],
    'shadowpay' => [
        'api_token' => 'paste-your-shadowpay-api-token-here',
    ],
    'waxpeer' => [
        'api_key' => 'paste-your-waxpeer-api-key-here',
    ],
    'mannco' => [
        'api_key' => 'paste-your-mannco-store-api-key-here',
    ],
    'haloskins' => [
        // Open Platform Trading API key from HaloSkins settings. Trade-only; not website login.
        'api_key' => 'paste-your-haloskins-trading-api-key-here',
        // Website session access_token (www.haloskins.com request header). Needed for listing counts.
        'access_token' => '',
    ],
    'rapidskins' => [
        // From https://www.rapidskins.com/account/api-key
        'api_key' => 'paste-your-rapidskins-api-key-here',
    ],
    'buff163' => [
        'session_cookie' => 'paste-your-buff163-session-cookie-here',
        'csrf_token' => 'paste-your-buff163-csrf-token-here',
    ],
    'ai' => [
        'api_key' => 'paste-your-openai-or-compatible-api-key-here',
        'model' => 'gpt-5-nano',
        'base_url' => 'https://api.openai.com/v1',
    ],
    'giphy' => [
        'api_key' => 'paste-your-giphy-api-key-here',
        'rating' => 'pg-13',
    ],

    // Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)
    // 1. Copy Client ID and Client Secret into the keys below.
    // 2. Add these exact values on the OAuth client (must match what the app sends):
    //    Authorized JavaScript origins: http://localhost
    //    Authorized redirect URIs:      http://localhost/csgo_price_tracker/google_callback.php
    //    Also register production later:
    //    Authorized JavaScript origins: https://YOUR-PRODUCTION-HOST
    //    Authorized redirect URIs:      https://YOUR-PRODUCTION-HOST/google_callback.php
    // 3. Leave redirect_uri empty to use the current host automatically, or set it
    //    to one of the registered URIs above.
    // Consent screen TESTING is OK for local (only listed test users can sign in).
    // Scopes requested by the app: openid email profile
    'google' => [
        'client_id' => 'paste-your-google-oauth-client-id-here',
        'client_secret' => 'paste-your-google-oauth-client-secret-here',
        'redirect_uri' => '',
    ],
    // Discord Developer Portal → Applications → OAuth2
    // 1. Copy Client ID and Client Secret into the keys below.
    // 2. Add these exact Redirects (must match what the app sends):
    //    http://localhost/csgo_price_tracker/discord_callback.php
    //    https://YOUR-PRODUCTION-HOST/discord_callback.php
    // 3. Leave redirect_uri empty to use the current host automatically, or set it
    //    to one of the registered URIs above.
    // Scopes requested by the app: identify email
    'discord' => [
        'client_id' => 'paste-your-discord-oauth-client-id-here',
        'client_secret' => 'paste-your-discord-oauth-client-secret-here',
        'redirect_uri' => '',
    ],
];
