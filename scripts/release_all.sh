#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FS_APP="$ROOT_DIR/flutter_app"
ANDROID_LOCAL_PROPERTIES="$FS_APP/android/local.properties"
IOS_INFO_PLIST="$FS_APP/ios/Runner/Info.plist"
RELEASE_DIR="$ROOT_DIR/release_artifacts"

usage() {
  cat <<EOF
Usage: $0 set <x.y.z+build> | bump (patch|minor|major) | build-only

Examples:
  $0 set 1.2.3+45        # set explicit version
  $0 bump patch           # bump patch and increment build number
  $0 build-only           # only build using current pubspec.yaml version

Notes:
  - This script treats flutter_app/pubspec.yaml as the single source of truth.
  - Android local.properties and iOS Info.plist will be updated to match.
  - Builds performed depending on the current OS: Android always, iOS only on macOS, Electron for current host.
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

cmd=$1

read_pubspec_version() {
  grep '^version:' "$FS_APP/pubspec.yaml" | awk '{print $2}'
}

write_pubspec_version() {
  local newver=$1
  perl -0777 -pe "s/^version:.*$/version: $newver/m" -i "$FS_APP/pubspec.yaml"
}

bump_pubspec() {
  local part=${1:-patch}
  local cur=$(read_pubspec_version)
  if [ -z "$cur" ]; then echo "No version in pubspec.yaml"; exit 1; fi
  local name=${cur%%+*}
  local build=${cur##*+}
  IFS='.' read -r major minor patch <<<"$name"
  case "$part" in
    patch) patch=$((patch+1));;
    minor) minor=$((minor+1)); patch=0;;
    major) major=$((major+1)); minor=0; patch=0;;
    *) echo "unknown part: $part"; exit 1;;
  esac
  build=$((build+1))
  local new="${major}.${minor}.${patch}+${build}"
  write_pubspec_version "$new"
  echo "$new"
}

set_pubspec() {
  local new=$1
  if [[ ! $new =~ ^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]+$ ]]; then
    echo "Version must be in form X.Y.Z+BUILD"; exit 1
  fi
  write_pubspec_version "$new"
  echo "$new"
}

sync_android_local_properties() {
  local build_name=$1
  local build_num=$2
  if [ -f "$ANDROID_LOCAL_PROPERTIES" ]; then
    # replace or add flutter.versionName and flutter.versionCode
    if grep -q '^flutter.versionName=' "$ANDROID_LOCAL_PROPERTIES"; then
      perl -pe "s/^flutter.versionName=.*/flutter.versionName=$build_name/; s/^flutter.versionCode=.*/flutter.versionCode=$build_num/" -i "$ANDROID_LOCAL_PROPERTIES"
    else
      echo "flutter.versionName=$build_name" >> "$ANDROID_LOCAL_PROPERTIES"
      echo "flutter.versionCode=$build_num" >> "$ANDROID_LOCAL_PROPERTIES"
    fi
    echo "Updated $ANDROID_LOCAL_PROPERTIES -> $build_name + $build_num"
  else
    echo "Warning: $ANDROID_LOCAL_PROPERTIES not found, creating"
    mkdir -p "$(dirname "$ANDROID_LOCAL_PROPERTIES")"
    echo "flutter.versionName=$build_name" > "$ANDROID_LOCAL_PROPERTIES"
    echo "flutter.versionCode=$build_num" >> "$ANDROID_LOCAL_PROPERTIES"
  fi
}

sync_ios_info_plist() {
  local build_name=$1
  local build_num=$2
  if [ -f "$IOS_INFO_PLIST" ]; then
    if [ "$(uname)" = "Darwin" ] && command -v /usr/libexec/PlistBuddy >/dev/null 2>&1; then
      /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $build_name" "$IOS_INFO_PLIST" || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_num" "$IOS_INFO_PLIST" || true
    else
      # Fallback: text replace
      perl -0777 -pe "s!(<key>CFBundleShortVersionString</key>\s*<string>)[^<]*(</string>)!\1$build_name\2!s; s!(<key>CFBundleVersion</key>\s*<string>)[^<]*(</string>)!\1$build_num\2!s;" -i "$IOS_INFO_PLIST"
    fi
    echo "Updated $IOS_INFO_PLIST -> $build_name + $build_num"
  else
    echo "Warning: $IOS_INFO_PLIST not found"
  fi
}

do_builds() {
  mkdir -p "$RELEASE_DIR"
  local build_name=$1
  local build_num=$2

  echo "Building Android APK..."
  if command -v flutter >/dev/null 2>&1; then
    (cd "$FS_APP" && flutter pub get)
    if (cd "$FS_APP" && flutter build apk --build-name="$build_name" --build-number="$build_num"); then
      # try to find apk
      apks=("$FS_APP/build/app/outputs/flutter-apk/app-release.apk" "$FS_APP/build/app/outputs/flutter-apk/app-release.apk")
      for a in "${apks[@]}"; do
        if [ -f "$a" ]; then
          target="$RELEASE_DIR/crossshot_android_${build_name}_${build_num}.apk"
          cp "$a" "$target" && echo "Android APK -> $target"
          break
        fi
      done
    else
      echo "Android build failed or flutter not configured"; true
    fi
  else
    echo "flutter not found in PATH, skipping Android build"
  fi

  if [ "$(uname)" = "Darwin" ]; then
    echo "Detected macOS — building iOS IPA (requires signing & Xcode config)..."
    if command -v flutter >/dev/null 2>&1; then
      # Determine export options plist
      EXPORT_PLIST="$FS_APP/ios/ExportOptions.plist"
      TEMP_EXPORT_PLIST=""
      BUILD_IPA_CMD=""

      if [ -f "$EXPORT_PLIST" ]; then
        BUILD_IPA_CMD=(flutter build ipa --export-options-plist=ios/ExportOptions.plist --build-name="$build_name" --build-number="$build_num")
      else
        if [ "${NO_CODESIGN:-0}" = "1" ]; then
          echo "ExportOptions.plist not found — building ipa with --no-codesign as NO_CODESIGN=1"
          BUILD_IPA_CMD=(flutter build ipa --no-codesign --build-name="$build_name" --build-number="$build_num")
        else
          echo "Warning: ios/ExportOptions.plist not found. Creating a temporary development ExportOptions.plist to attempt export."
          TEMP_EXPORT_PLIST=$(mktemp /tmp/ExportOptions.XXXX.plist)
          cat > "$TEMP_EXPORT_PLIST" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
</dict>
</plist>
EOF
          BUILD_IPA_CMD=(flutter build ipa --export-options-plist="$TEMP_EXPORT_PLIST" --build-name="$build_name" --build-number="$build_num")
        fi
      fi

      if (cd "$FS_APP" && "${BUILD_IPA_CMD[@]}"); then
        # find any ipa produced
        ipa_dir="$FS_APP/build/ios/ipa"
        ipa_file=""
        if [ -d "$ipa_dir" ]; then
          ipa_file=$(ls "$ipa_dir"/*.ipa 2>/dev/null | head -n 1 || true)
        fi
        if [ -n "$ipa_file" ] && [ -f "$ipa_file" ]; then
          target="$RELEASE_DIR/crossshot_ios_${build_name}_${build_num}.ipa"
          cp "$ipa_file" "$target"
          echo "iOS IPA -> $target (from $ipa_file)"
        else
          echo "IPA not found; iOS build may require codesign config or ExportOptions mismatch"
        fi
      else
        echo "iOS build failed or requires manual signing configuration"
      fi

      # cleanup temp plist if created
      if [ -n "$TEMP_EXPORT_PLIST" ] && [ -f "$TEMP_EXPORT_PLIST" ]; then
        rm -f "$TEMP_EXPORT_PLIST"
      fi
    else
      echo "flutter not found, skipping iOS build"
    fi
  else
    echo "Not macOS — skipping iOS build"
  fi

  # Electron: optional build and collection. Set BUILD_ELECTRON=1 to enable building (npm ci/install + npm run dist).
  ELECTRON_DIR="$ROOT_DIR/electron_app"
  if [ -d "$ELECTRON_DIR" ]; then
    # Optionally build Electron if requested
    if command -v npm >/dev/null 2>&1; then
      echo "Building Electron for host platform (BUILD_ELECTRON=1)..."
      # Enforce reproducible installs: require npm ci to succeed. Do not fallback to npm install to avoid
      # accidental dependency upgrades during CI. If npm ci fails, abort and surface the error so lockfile
      # can be fixed and committed.
      (cd "$ELECTRON_DIR" && npm ci) || { echo "ERROR: 'npm ci' failed in $ELECTRON_DIR. Aborting to avoid unintended dependency changes. Please fix package-lock.json and retry."; exit 1; }

      dist_ok=0
      max_retries=1
      retry_delay=5
      attempt=1
      while [ $attempt -le $max_retries ]; do
        echo "Running electron dist (attempt $attempt/$max_retries)..."
        if (cd "$ELECTRON_DIR" && npm run dist); then
          dist_ok=1
          break
        fi
        echo "electron dist failed on attempt $attempt. Retrying in ${retry_delay}s..."
        sleep $retry_delay
        attempt=$((attempt+1))
        retry_delay=$((retry_delay*2))
      done
      if [ "$dist_ok" -ne 1 ]; then
        echo "Electron build failed after $max_retries attempts; proceeding to collection if any installers exist"
      fi
    fi

    if [ -d "$ELECTRON_DIR/out/make" ]; then
      echo "Collecting existing electron installers from electron_app/out/make"
      echo "Processing electron installers in $ELECTRON_DIR/out/make"
      echo "Collecting existing electron installers from electron_app/out/make"
      echo "Processing electron installers in $ROOT_DIR/electron_app/out/make"
      while IFS= read -r -d '' file; do
        [ -f "$file" ] || continue
        filename=$(basename -- "$file")
        ext="${filename##*.}"
        ext_lc=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
        parent=$(basename "$(dirname "$file")")

        case "$ext_lc" in
          dmg|pkg)
            platform="macos";;
          exe|msi)
            platform="windows";;
          deb|appimage|rpm|snap|tar|gz)
            platform="linux";;
          zip)
            if echo "$parent" | grep -qi "darwin\|mac"; then platform="macos"; elif echo "$parent" | grep -qi "win\|windows"; then platform="windows"; else platform="archive"; fi
            ;;
          *)
            platform="$parent";;
        esac

        platform=$(echo "$platform" | tr ' ' '_' )
        target="$RELEASE_DIR/crossshot_${platform}_${build_name}_${build_num}.${ext}"
        cp "$file" "$target" && echo "Copied $file -> $target"
      done < <(find "$ROOT_DIR/electron_app/out/make" -type f -print0)

      # On macOS, try to create DMG from darwin zips if present
      if [ "$(uname)" = "Darwin" ]; then
        if command -v hdiutil >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
          echo "Attempting to create DMG(s) from darwin zip(s) if present..."
          # Find darwin zip files anywhere under out/make (including nested dirs)
          while IFS= read -r -d '' z; do
            [ -f "$z" ] || continue
            dmg_target="$RELEASE_DIR/crossshot_macos_${build_name}_${build_num}.dmg"
            if [ -f "$dmg_target" ]; then
              echo "DMG already exists: $dmg_target"
              continue
            fi
            tmpdir=$(mktemp -d)
            echo "Unzipping $z to $tmpdir"
            unzip -q "$z" -d "$tmpdir" || { echo "unzip failed for $z"; rm -rf "$tmpdir"; continue; }
            app=$(find "$tmpdir" -maxdepth 4 -type d -name "*.app" | head -n 1 || true)
            if [ -n "$app" ]; then
              echo "Found app: $app — creating DMG..."
              tmpdmg="$tmpdir/out.dmg"
              hdiutil create -volname "crossshot" -srcfolder "$app" -ov -format UDZO "$tmpdmg" >/dev/null 2>&1 || true
              if [ -f "$tmpdmg" ]; then
                mv "$tmpdmg" "$dmg_target"
                echo "DMG created -> $dmg_target"
              else
                echo "Failed to create dmg from $app"
              fi
            else
              echo "No .app found inside $z; skipping dmg creation"
            fi
            rm -rf "$tmpdir"
          done < <(find "$ROOT_DIR/electron_app/out/make" -type f -iname "*darwin*.zip" -print0)
        else
          echo "hdiutil or unzip not available — cannot create dmg automatically"
        fi
      fi
      else
        echo "No electron installers found in out/make — skipping Electron collection"
      fi
  else
    echo "electron_app directory not found — skipping Electron collection"
  fi

  echo "Artifacts collected in $RELEASE_DIR"
}

case "$cmd" in
  set)
    if [ "$#" -ne 2 ]; then echo "set requires a version param"; usage; exit 1; fi
    new=$(set_pubspec "$2")
    ;;
  bump)
    part=${2:-patch}
    new=$(bump_pubspec "$part")
    ;;
  build-only)
    new=$(read_pubspec_version)
    ;;
  *)
    usage; exit 1;
    ;;
esac

build_name=${new%%+*}
build_num=${new##*+}

echo "Version in use: $new (name=$build_name, number=$build_num)"

sync_android_local_properties "$build_name" "$build_num"
sync_ios_info_plist "$build_name" "$build_num"

# Sync electron package.json version to match Flutter pubspec (use build_name without +build)
sync_electron_package_json() {
  local ver=$1
  local pkg="$ROOT_DIR/electron_app/package.json"
  if [ -f "$pkg" ]; then
    # Use perl to safely replace the JSON version value in-place
    perl -0777 -pe "s/\"version\"\s*:\s*\"[^\"]*\"/\"version\": \"$ver\"/s" -i "$pkg"
    echo "Updated $pkg -> $ver"
  else
    echo "Warning: $pkg not found, skipping electron version sync"
  fi
}

sync_electron_package_json "$build_name"

do_builds "$build_name" "$build_num"

echo "Done."
