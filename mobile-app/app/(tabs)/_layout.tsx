import { Tabs } from "expo-router";
import { BookOpen, Heart, Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../src/theme/appTheme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.iconDefault,
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
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="search"
        options={{
          title: "Busqueda",
          tabBarIcon: ({ color }) => <Search size={18} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color }) => <Heart size={18} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="codes"
        options={{
          title: "Codigos",
          tabBarIcon: ({ color }) => <BookOpen size={18} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  );
}
