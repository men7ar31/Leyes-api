import "../src/utils/patchBooleanProps";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { useFonts } from "expo-font";
import { Montserrat_600SemiBold, Montserrat_700Bold } from "@expo-google-fonts/montserrat";
import { Lato_400Regular, Lato_400Regular_Italic, Lato_700Bold } from "@expo-google-fonts/lato";
import { AppThemeProvider } from "../src/theme/appTheme";
import { LaunchBrandSplash } from "../src/components/LaunchBrandSplash";

enableScreens(true);
const SPLASH_DURATION_MS = 900;

export default function RootLayout() {
  const [showLaunchBranding, setShowLaunchBranding] = useState(true);
  const splashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fontsLoaded] = useFonts({
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Lato_400Regular,
    Lato_400Regular_Italic,
    Lato_700Bold,
  });

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 1000 * 60 * 3,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
          },
        },
      })
  );

  useEffect(() => {
    splashTimerRef.current = setTimeout(() => {
      setShowLaunchBranding(false);
      splashTimerRef.current = null;
    }, SPLASH_DURATION_MS);

    return () => {
      if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <QueryClientProvider client={client}>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
          {showLaunchBranding ? <LaunchBrandSplash /> : null}
        </QueryClientProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
