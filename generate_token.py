"""
Run this once on your Mac to authorize Google Calendar + Gmail access.
It will open a browser window — log in with your Google account.
Generates token.json which gets uploaded to the server.
"""

from google_auth_oauthlib.flow import InstalledAppFlow
import json

SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets',
]

flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
creds = flow.run_local_server(port=0)

with open('token.json', 'w') as f:
    f.write(creds.to_json())

print("token.json created successfully.")
