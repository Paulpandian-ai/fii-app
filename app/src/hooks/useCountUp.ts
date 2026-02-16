import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export const useCountUp = (target: number, duration: number = 1000): number => {
  const [display, setDisplay] = useState(0);
  const animRef = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !Number.isFinite(target) || target === 0) {
      setDisplay(target);
      return;
    }

    hasAnimated.current = true;

    animRef.setValue(0);
    const listener = animRef.addListener(({ value }) => {
      setDisplay(Math.round(value));
    });

    Animated.timing(animRef, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();

    return () => {
      animRef.removeListener(listener);
    };
  }, [target, duration, animRef]);

  return display;
};
