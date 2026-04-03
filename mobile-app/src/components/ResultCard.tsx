import { PanResponder, View } from "react-native";
import { memo, useRef } from "react";
import type { SaijSearchHit } from "../types/saij";
import { LawCard } from "./LawCard";

type Props = {
  hit: SaijSearchHit;
  onPress: () => void;
  onPressIn?: () => void;
  onFavoritePress?: () => void;
  isFavorite?: boolean;
  highlighted?: boolean;
};

const ResultCardComponent = ({
  hit,
  onPress,
  onPressIn,
  onFavoritePress,
  isFavorite = false,
  highlighted = false,
}: Props) => {
  const didSwipeRef = useRef(false);

  const swipeResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (!onFavoritePress) return false;
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      return absDx > 32 && absDy < 12 && absDx > absDy * 2;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!onFavoritePress) return;
      if (gestureState.dx >= 56) {
        didSwipeRef.current = true;
        onFavoritePress();
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
        onPressIn={onPressIn}
        onFavoritePress={onFavoritePress}
        isFavorite={isFavorite}
        highlighted={highlighted}
      />
    </View>
  );
};

export const ResultCard = memo(ResultCardComponent);
