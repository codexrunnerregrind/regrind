---
prev: false
next: false
title: 'reCAPTCHA'
---

# reCAPTCHA

Grindr asks some accounts for a captcha check when they sign in with email and password. On Android, ReGrind passes the check by itself.

Grindr answers a wrong password and a missing captcha with the same error, so check your email and password first.

## Requirements

- Android with Google Play services; microG isn't enough
- The official Grindr app installed; you don't need to sign in to it

Windows, Linux, macOS and iOS can't pass the captcha check.

## If sign-in still fails

- **"Wrong email or password, or Grindr rejected the captcha check"**: sign in to the official Grindr app with the same email and password. If that works, Grindr rejected the check.
- **"Grindr rejected the captcha check"**: Grindr didn't accept the captcha score Google gave your device.
- **"Grindr’s captcha check needs the official Grindr app installed"**: install Grindr from Google Play.

The check passes more often on a phone with Google Play services, a locked bootloader and no root.

## Privacy

Each time Grindr asks for a captcha, ReGrind sends device information to Google. See the [privacy policy](/privacy).
