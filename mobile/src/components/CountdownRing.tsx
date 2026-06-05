import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Typography } from '../theme';

type Props = {
    duration: number;
    size: number;
    onComplete: () => void;
};

export default function CountdownRing({ duration, size, onComplete }: Props) {
    const [elapsed, setElapsed] = useState(0);
    const totalMs = duration * 1000;
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, 1 - elapsed / totalMs);
    const strokeDashoffset = circumference * (1 - progress);
    const remainingSeconds = Math.ceil((totalMs - elapsed) / 1000);

    useEffect(() => {
        if (elapsed >= totalMs) {
            onComplete();
            return;
        }
        const tick = setInterval(() => {
            setElapsed(e => Math.min(e + 100, totalMs));
        }, 100);
        return () => clearInterval(tick);
    }, [elapsed, totalMs]);

    const color = remainingSeconds <= 3 ? Colors.brand.error : Colors.brand.gold;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size} style={styles.svg}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={8} fill="none"
                />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={color}
                    strokeWidth={8} fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            <Text style={[styles.number, { color }]}>{remainingSeconds}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    svg: {
        position: 'absolute',
    },
    number: {
        fontSize: 42,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
});
