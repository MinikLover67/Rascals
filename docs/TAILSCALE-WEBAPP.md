# Rascals Web-App über Tailscale hosten (kostenlos, beidseitig)

Nutze die Rascals Web-App im Browser auf einem zweiten Gerät — Handy,
Tablet, Schul-Laptop — ohne Server mieten, ohne Domain, ohne Port-Forwarding.
Tailscale ist für private Nutzung auf **beiden Seiten kostenlos** (Free plan:
bis zu 3 Nutzer / 100 Geräte) und verbindet deine Geräte über einen
verschlüsselten Tunnel, als wären sie im selben WLAN.

Der Trick: Die Web-App ist eine statische Seite (`docs/web-beta` bzw. das
`rascals-web-*.zip`). Du dienst sie lokal und lässt Tailscale die Adresse im
Netzwerk veröffentlichen (`tailscale serve`) — mit echtem HTTPS-Zertifikat
und fester Name, ohne dass du irgendwas freigeben musst.

---

## 1. Einmalig: Tailscale auf beiden Geräten

**PC (Host):** <https://tailscale.com/download> → Installer, mit Google /
Microsoft / GitHub-Konto anmelden. Fertig.

**Handy:** Tailscale aus dem App Store / Play Store, mit **demselben Konto**
anmelden. Beide Geräte erscheinen im Admin-Panel (https://login.tailscale.com)
und erreichen sich ab jetzt direkt.

## 2. Web-App lokal starten (Host-PC)

```powershell
# Ordner entpacken (rascals-web-v0.1.39.zip) oder das Repo nehmen:
cd pfad\zu\Rascals\docs\web-beta

# Python (ist meist vorhanden) — statischer Server auf Port 8080:
python -m http.server 8080
```

Alternative mit Node:

```powershell
npx serve dist -l 8080
```

Test im Browser: `http://localhost:8080` zeigt die Web-App.

## 3. Über Tailscale veröffentlichen

Neues PowerShell-Fenster (der Server muss weiterlaufen — das andere Fenster
offen lassen):

```powershell
# HTTPS-Adresse im Tailscale-Netzwerk verfügbar machen:
tailscale serve --bg 8080
```

Du bekommst eine Adresse wie:

```
https://dein-pc-name.tailnet-name.ts.net
```

- `--bg` läuft im Hintergrund weiter (auch nach Fenster-close).
- HTTPS mit gültigem Zertifikat macht Tailscale automatisch — keine
  Zertifikats-Verwaltung, keine Domain nötig.
- Rückgängig: `tailscale serve --https=443 off` bzw. `tailscale serve reset`.

> Diese Seite ist nur für **deine** Tailscale-Geräte sichtbar — niemand im
> offenen Internet kann sie aufrufen.

## 4. Shortcut auf beiden Geräten

**Windows (Host oder zweiter PC):**

1. Die `https://…ts.net`-Adresse im Edge/Chrome öffnen.
2. Menü (…) → **Apps** → **Diese Website als App installieren**.
   → Rascals erscheint im Startmenü mit eigenem Fenster und Icon, wie ein
   echtes Programm (kein Browser-Chrome).

**Android:**

1. Adresse in Chrome öffnen → Menü (⋮) → **Zum Startbildschirm hinzufügen**.
2. Öffnet danach Vollbild wie eine App (PWA-Verhalten).

**iPhone/iPad:** Safari → Teilen-Button → **Zum Home-Bildschirm**.

## 5. Was dieses Setup ist (und was nicht)

- **Was es ist:** eine bequeme, private Art, die **Web-App** (Oberfläche) auf
  allen deinen Geräten zu öffnen, ohne GitHub Pages oder einen Upload.
- **Was es bleibt:** Rascals selbst ist P2P — Nachrichten laufen weiterhin
  Ende-zu-Ende-verschlüsselt direkt zwischen den Geräten (Signaling über
  Nostr-Relays). Tailscale transportiert nur die statische Seite, keine
  Chat-Inhalte.
- **Free-Plan-Grenzen:** 3 Nutzer / 100 Geräte — für "ich + Handy + Laptop +
  ein Freund" reicht es locker. Beide Seiten zahlen nichts.

## 6. Troubleshooting

| Problem | Lösung |
| --- | --- |
| Adresse lädt nicht vom Handy | Prüfen: beide Geräte im selben Tailscale-Konto angemeldet + Handy hat Tailscale aktiviert (VPN-Symbol). |
| `tailscale serve` sagt "not logged in" | `tailscale up` im PowerShell-Fenster ausführen. |
| Nach PC-Neustart weg | Server neu starten (`python -m http.server 8080`) — `tailscale serve --bg` bleibt normal erhalten, prüfen mit `tailscale serve status`. |
| Alte Version sichtbar | Browser-Cache: Seite mit Strg+Umschalt+R neu laden. |
