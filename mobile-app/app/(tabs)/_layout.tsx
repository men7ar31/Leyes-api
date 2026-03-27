import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../src/theme/appTheme";

const TabIcon = ({ symbol, color }: { symbol: string; color: string }) => (
  <Text style={{ color, fontSize: 17 }}>{symbol}</Text>
);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(8, insets.bottom),
          backgroundColor: colors.card,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="search"
        options={{
          title: "Busqueda",
          tabBarIcon: ({ color }) => <TabIcon symbol={"\u2315"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color }) => <TabIcon symbol={"\u2605"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="codes"
        options={{
          title: "Codigos",
          tabBarIcon: ({ color }) => <TabIcon symbol={"\u2696"} color={color} />,
        }}
      />
    </Tabs>
  );
}
