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
          cp "$a" "$RELEASE_DIR/app-android-${build_name}_${build_num}.apk" && echo "Android APK -> $RELEASE_DIR/app-android-${build_name}_${build_num}.apk"
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
      if (cd "$FS_APP" && flutter build ipa --export-options-plist=ios/ExportOptions.plist --build-name="$build_name" --build-number="$build_num"); then
        # IPA location
        ipa="$FS_APP/build/ios/ipa/Runner.ipa"
        if [ -f "$ipa" ]; then
          cp "$ipa" "$RELEASE_DIR/app-ios-${build_name}_${build_num}.ipa"
          echo "iOS IPA -> $RELEASE_DIR/app-ios-${build_name}_${build_num}.ipa"
        else
          echo "IPA not found; iOS build may require codesign config"
        fi
      else
        echo "iOS build failed or requires manual signing configuration"
      fi
    else
      echo "flutter not found, skipping iOS build"
    fi
  else
    echo "Not macOS — skipping iOS build"
  fi

  # Electron build for current host
  if [ -d "$ROOT_DIR/electron_app" ] && command -v npm >/dev/null 2>&1; then
    echo "Building Electron for host platform..."
    (cd "$ROOT_DIR/electron_app" && npm ci)
    if (cd "$ROOT_DIR/electron_app" && npm run dist); then
      echo "Collecting electron installers from electron_app/out/make"
      if [ -d "$ROOT_DIR/electron_app/out/make" ]; then
        cp -r "$ROOT_DIR/electron_app/out/make" "$RELEASE_DIR/electron_out_make"
        echo "Electron installers copied to $RELEASE_DIR/electron_out_make"
      else
        echo "electron out/make not found — check electron-forge output"
      fi
    else
      echo "Electron build failed"
    fi
  else
    echo "npm or electron_app not found — skipping Electron build"
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

do_builds "$build_name" "$build_num"

echo "Done."
