import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BRAND_LOGO = require("../assets/branding/lexplora-logo.png");

export const LaunchBrandSplash = () => {
  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.main}>
        <View style={styles.centerBlock}>
          <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>LexPlora</Text>
        </View>

        <View style={styles.bottomBlock}>
          <Text style={styles.motto}>"Populus Iura Sua Novit"</Text>
          <View style={styles.creditBar}>
            <Text style={styles.creditText}>Designed by Nicolás Medina</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F4F7FB",
    zIndex: 999,
    elevation: 30,
  },
  main: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 34,
    justifyContent: "space-between",
    alignItems: "center",
  },
  centerBlock: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: -22,
  },
  logo: {
    width: 194,
    height: 194,
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 38,
    lineHeight: 44,
    color: "#1b375e",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  bottomBlock: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  motto: {
    fontFamily: "Lato_400Regular_Italic",
    fontSize: 16,
    lineHeight: 22,
    color: "#4E6285",
    textAlign: "center",
  },
  creditBar: {
    minWidth: 224,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#142B49",
    alignItems: "center",
    justifyContent: "center",
  },
  creditText: {
    fontFamily: "Lato_700Bold",
    fontSize: 13,
    lineHeight: 17,
    color: "#EEF4FF",
    textAlign: "center",
  },
});
