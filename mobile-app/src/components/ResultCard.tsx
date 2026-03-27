import { PanResponder, View } from "react-native";
import { useRef, useState } from "react";
import type { SaijSearchHit } from "../types/saij";
import { LawCard } from "./LawCard";

type Props = {
  hit: SaijSearchHit;
  onPress: () => void;
  onSwipeRight?: () => void;
};

export const ResultCard = ({ hit, onPress, onSwipeRight }: Props) => {
  const didSwipeRef = useRef(false);
  const [isFavVisual, setIsFavVisual] = useState(false);

  const swipeResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (!onSwipeRight) return false;
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      return absDx > 24 && absDx > absDy * 1.6;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!onSwipeRight) return;
      if (gestureState.dx >= 56) {
        didSwipeRef.current = true;
        onSwipeRight();
        setIsFavVisual(true);
        setTimeout(() => {
          didSwipeRef.current = false;
        }, 120);
      }
    },
  });

  return (
    <View {...swipeResponder.panHandlers}>
      <LawCard
        hit={hit}
        onPress={() => {
          if (didSwipeRef.current) return;
          onPress();
        }}
        onFavoritePress={
          onSwipeRight
            ? () => {
                onSwipeRight();
                setIsFavVisual(true);
              }
            : undefined
        }
        isFavorite={isFavVisual}
      />
    </View>
  );
};
