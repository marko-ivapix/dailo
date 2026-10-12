# Dailo za iPhone — widgeti i „Podeli u Dailo”

Widgeti **Dailo · Danas** i **Dailo · Navike** i deljenje teksta ili linka u Dailo rade i na iPhone-u, kao na Androidu. Za njih treba **plaćen Apple Developer nalog**, jer besplatan Apple ID ne dozvoljava App Groups. Aplikacija radi i bez ovih koraka; widgeti tada pišu „Otvori Dailo”.

Kod je već u repozitorijumu:

| Fajl | Gde ide |
| --- | --- |
| `ios/App/App/DailoWidgetPlugin.swift`, `ios/App/App/DailoViewController.swift` | već su u targetu **App** (ništa ne treba raditi) |
| `ios/DailoWidgets/DailoWidgets.swift` | u novi target **DailoWidgets** (korak 2) |
| `ios/DailoShare/ShareViewController.swift` | u novi target **DailoShare** (korak 3) |

Sve tri strane razmenjuju podatke preko App Group-a `group.cloud.ivapix.dailo`.

## 1. App Group za aplikaciju

1. `npm run cap:ios`, pa u Xcode-u: projekat **App** → target **App** → **Signing & Capabilities**.
2. **+ Capability** → **App Groups** → **+** → upiši `group.cloud.ivapix.dailo` i štikliraj ga.

## 2. Widgeti (target „DailoWidgets”)

1. **File → New → Target… → Widget Extension** → **Next**.
2. **Product Name**: `DailoWidgets`; isključi **Include Live Activity**, **Include Control** i **Include Configuration App Intent** → **Finish** → na pitanje „Activate scheme?” izaberi **Cancel** (ostaje šema App).
3. U levom stablu, u novoj fascikli **DailoWidgets**, obriši fajlove koje je Xcode napravio (`DailoWidgets.swift`, `DailoWidgetsBundle.swift` i slične) → **Move to Trash**.
4. Desni klik na fasciklu **DailoWidgets** → **Add Files to "App"…** → izaberi `ios/DailoWidgets/DailoWidgets.swift` iz repozitorijuma; dole štikliraj samo target **DailoWidgets** → **Add**.
5. Target **DailoWidgets** → **General** → **Minimum Deployments**: iOS 15.0.
6. Target **DailoWidgets** → **Signing & Capabilities**: isti **Team**; **+ Capability** → **App Groups** → štikliraj `group.cloud.ivapix.dailo`.

## 3. „Podeli u Dailo” (target „DailoShare”)

1. **File → New → Target… → Share Extension** → **Product Name**: `DailoShare` → **Finish** → **Cancel** za aktiviranje šeme.
2. U fascikli **DailoShare** obriši `ShareViewController.swift` koji je Xcode napravio i dodaj `ios/DailoShare/ShareViewController.swift` iz repozitorijuma (samo za target **DailoShare**). `MainInterface.storyboard` ostaje.
3. Otvori `DailoShare/Info.plist` → **NSExtension → NSExtensionAttributes → NSExtensionActivationRule**. Promeni tip iz String u **Dictionary** i dodaj dve stavke:
   - `NSExtensionActivationSupportsText` (Boolean) = YES;
   - `NSExtensionActivationSupportsWebURLWithMaxCount` (Number) = 1.
4. Target **DailoShare** → **General** → **Minimum Deployments**: iOS 15.0; **Signing & Capabilities** → isti **Team** → **App Groups** → `group.cloud.ivapix.dailo`.

## 4. Provera

1. Šema **App**, svoj iPhone, ▶ (Run). Otvori Dailo jednom (da zapiše današnji plan).
2. Dugo pritisni početni ekran → **+** → potraži **Dailo** → dodaj **Dailo · Danas** i **Dailo · Navike**. Dodir na widget otvara Dailo; u srednjem i velikom widgetu Navika dodir na neštikliranu naviku je beleži.
3. U Safari-ju **Podeli → Dailo** (ako ga nema, **Više** pa uključi Dailo). Pojavi se „Sačuvano za Dailo”. Otvori Dailo: link postaje resurs u Inbox-u, a tekst se otvara u Brzom dodavanju.

Javi šta radi, a šta ne; rezultati se upisuju u dnevnik promena tek po tvojoj prijavi.
