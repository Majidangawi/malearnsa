/**
 * SupabaseAdmin.js
 * Mint Supabase-compatible JWTs from Apps Script using HS256 HMAC signing
 * with the JWT Secret stored in Script Properties. Payload matches
 * spec §16.4 of docs/superpowers/specs/2026-04-23-player-chat-design.md.
 *
 * Contract: mintSupabaseToken_(uid, email, displayName, isMajid) -> signed JWT string (1h expiry)
 */

function mintSupabaseToken_(uid, email, displayName, isMajid) {
  var props = PropertiesService.getScriptProperties();
  var jwtSecret = props.getProperty('SUPABASE_JWT_SECRET');
  if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET not set in Script Properties');

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'HS256', typ: 'JWT' };
  var payload = {
    sub: String(uid),
    aud: 'authenticated',
    role: 'authenticated',
    email: String(email || ''),
    iss: 'supabase',
    iat: now,
    exp: now + 3600,
    app_metadata: { isMajid: !!isMajid, provider: 'ma-learn' },
    user_metadata: { displayName: displayName || null }
  };

  var encHeader = base64UrlEncode_(JSON.stringify(header));
  var encPayload = base64UrlEncode_(JSON.stringify(payload));
  var signingInput = encHeader + '.' + encPayload;

  var signatureBytes = Utilities.computeHmacSha256Signature(signingInput, jwtSecret);
  var encSignature = base64UrlEncodeBytes_(signatureBytes);

  return signingInput + '.' + encSignature;
}

function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
