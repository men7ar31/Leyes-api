const BOOLEAN_PROP_NAMES = new Set([
  "selectable",
  "disabled",
  "enabled",
  "selected",
  "visible",
  "scrollEnabled",
  "nestedScrollEnabled",
  "showsVerticalScrollIndicator",
  "showsHorizontalScrollIndicator",
  "horizontal",
  "multiline",
  "editable",
  "autoCorrect",
  "autoFocus",
  "secureTextEntry",
  "contextMenuHidden",
  "caretHidden",
  "allowFontScaling",
  "adjustsFontSizeToFit",
  "focusable",
  "collapsable",
  "accessible",
  "removeClippedSubviews",
  "bounces",
  "pagingEnabled",
  "accessibilityElementsHidden",
  // react-native-screens / native-stack boolean props
  "customAnimationOnSwipe",
  "fullScreenSwipeShadowEnabled",
  "homeIndicatorHidden",
  "preventNativeDismiss",
  "gestureEnabled",
  "statusBarHidden",
  "statusBarTranslucent",
  "hideKeyboardOnSwipe",
  "navigationBarTranslucent",
  "navigationBarHidden",
  "nativeBackButtonDismissalEnabled",
  "synchronousShadowStateUpdatesEnabled",
  "androidResetScreenShadowStateOnOrientationChangeEnabled",
  "ios26AllowInteractionsDuringTransition",
  "sheetGrabberVisible",
  "sheetExpandsWhenScrolledToEdge",
  "sheetShouldOverflowTopInset",
  "sheetDefaultResizeAnimationEnabled",
  "freezeOnBlur",
  "shouldFreeze",
]);

const getTypeName = (type: any) => {
  if (typeof type === "string") return type;
  return type?.displayName || type?.name || "Anonymous";
};

if (!(global as any).__booleanPropCoercionPatched) {
  (global as any).__booleanPropCoercionPatched = true;
  const React = require("react");
  const { UIManager } = require("react-native");
  const booleanPropsCache = new Map<string, Set<string>>();
  const shouldCoerceAll = false;

  // One-time signal to confirm this patch is loaded.
  console.warn("[boolean-prop] patch loaded");

  const parseBooleanString = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
    if (["undefined", "null"].includes(normalized)) return null;
    return null;
  };

  const getBooleanPropsForNativeType = (type: string) => {
    const cached = booleanPropsCache.get(type);
    if (cached) return cached;
    const result = new Set<string>();
    try {
      const config = UIManager?.getViewManagerConfig?.(type);
      const nativeProps = config?.NativeProps ?? config?.nativeProps;
      if (nativeProps && typeof nativeProps === "object") {
        for (const [propName, propType] of Object.entries(nativeProps)) {
          if (propType === "boolean") {
            result.add(propName);
          }
        }
      }
    } catch {
      // Ignore and fall back to the static allow-list.
    }
    booleanPropsCache.set(type, result);
    return result;
  };

  const coerceBooleanProps = (type: any, props: any) => {
    if (!props) return props;
    let mutated = false;
    let nativeBooleanProps: Set<string> | null = null;
    for (const key of Object.keys(props)) {
      let shouldCoerce = BOOLEAN_PROP_NAMES.has(key);
      if (!shouldCoerce && typeof type === "string") {
        if (!nativeBooleanProps) {
          nativeBooleanProps = getBooleanPropsForNativeType(type);
        }
        shouldCoerce = nativeBooleanProps.has(key);
      }
      if (!shouldCoerce && !shouldCoerceAll) continue;

      const value = props[key];
      if (typeof value !== "string") continue;

      const parsed = parseBooleanString(value);
      if (parsed === null) {
        console.warn(
          `[boolean-prop] invalid boolean string ${getTypeName(type)}.${key}=${JSON.stringify(value)}`
        );
        if (!mutated) {
          props = { ...props };
          mutated = true;
        }
        delete props[key];
        continue;
      }

      if (!mutated) {
        props = { ...props };
        mutated = true;
      }
      props[key] = parsed;
      const mode = shouldCoerce ? "coerced" : "forced";
      console.warn(
        `[boolean-prop] ${mode} ${getTypeName(type)}.${key} from "${value}" to ${props[key]}`
      );
    }
    return props;
  };

  const originalCreateElement = React.createElement;
  React.createElement = (type: any, props: any, ...children: any[]) =>
    originalCreateElement(type, coerceBooleanProps(type, props), ...children);

  try {
    const runtime = require("react/jsx-runtime");
    const wrapJsx = (fn: any) => (type: any, props: any, ...rest: any[]) =>
      fn(type, coerceBooleanProps(type, props), ...rest);
    if (runtime.jsx) {
      runtime.jsx = wrapJsx(runtime.jsx);
    }
    if (runtime.jsxs) {
      runtime.jsxs = wrapJsx(runtime.jsxs);
    }
    if (runtime.jsxDEV) {
      runtime.jsxDEV = wrapJsx(runtime.jsxDEV);
    }
  } catch {
    // Ignore if runtime is unavailable.
  }

  try {
    const devRuntime = require("react/jsx-dev-runtime");
    const wrapJsx = (fn: any) => (type: any, props: any, ...rest: any[]) =>
      fn(type, coerceBooleanProps(type, props), ...rest);
    if (devRuntime.jsx) {
      devRuntime.jsx = wrapJsx(devRuntime.jsx);
    }
    if (devRuntime.jsxs) {
      devRuntime.jsxs = wrapJsx(devRuntime.jsxs);
    }
    if (devRuntime.jsxDEV) {
      devRuntime.jsxDEV = wrapJsx(devRuntime.jsxDEV);
    }
  } catch {
    // Ignore if dev runtime is unavailable.
  }

  // Note: Avoid patching nativeFabricUIManager (HostObject). It throws on assignment.
}
