import "../src/utils/patchBooleanProps";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { AppThemeProvider } from "../src/theme/appTheme";

enableScreens(false);

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
          },
        },
      })
  );

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <QueryClientProvider client={client}>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </QueryClientProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
