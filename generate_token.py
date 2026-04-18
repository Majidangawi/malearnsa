"""
Generate a Google OAuth token for a specific account.

Usage:
    python3 generate_token.py                # primary account -> token.json
    python3 generate_token.py angawi         # -> token-angawi.json
    python3 generate_token.py malearn        # -> token-malearn.json
    python3 generate_token.py majidangawi    # -> token-majidangawi.json

For each run: opens a browser, log in as the target Google account,
approve all the scopes. Output file uploads to the droplet via scp.

All accounts get the SAME 9 scopes. Majid's decision:
Calendar + Gmail + Sheets + Drive + Docs on every account.
"""

import sys
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
]

ACCOUNT_FILES = {
    None:            'token.json',
    'primary':       'token.json',
    'angawi':        'token-angawi.json',
    'malearn':       'token-malearn.json',
    'majidangawi':   'token-majidangawi.json',
}


def main():
    account = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if account not in ACCOUNT_FILES:
        valid = [k for k in ACCOUNT_FILES if k]
        print(f"Unknown account '{account}'. Valid: {', '.join(valid)}")
        sys.exit(1)

    output_file = ACCOUNT_FILES[account]
    label = account or 'primary (majed.engawi)'

    print(f"Generating token for: {label}")
    print(f"Output file: {output_file}")
    print()

    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    creds = flow.run_local_server(port=0)

    with open(output_file, 'w') as f:
        f.write(creds.to_json())

    print(f"\n{output_file} created successfully.")


if __name__ == '__main__':
    main()
