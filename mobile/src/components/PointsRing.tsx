import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
    points: number;
    level: string;
    nextLevelPoints: number;
    size?: number;
};

export default function PointsRing({ points, level, nextLevelPoints, size = 180 }: Props) {
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(points / nextLevelPoints, 1);
    const strokeDashoffset = circumference - progress * circumference;

    return (
        <View style={styles.container}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#161624"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#C9A84C"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={styles.textContainer}>
                <Text style={styles.points}>{points}</Text>
                <Text style={styles.level}>{level.toUpperCase()} → PRO {nextLevelPoints} pts</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 8,
    },
    textContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    points: {
        color: '#C9A84C',
        fontSize: 48,
        fontWeight: '900',
    },
    level: {
        color: '#6A6680',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    },
});
