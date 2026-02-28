import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { LearningPath, Lesson } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  paths: LearningPath[];
  completedLessons: Set<string>;
  onCompleteLesson: (lessonId: string) => void;
}

const PATH_COLORS: Record<string, { primary: string; bg: string }> = {
  basics: { primary: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  signals: { primary: '#60A5FA', bg: 'rgba(96,165,250,0.08)' },
  advanced: { primary: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
};

export const LearningPaths: React.FC<Props> = ({ paths, completedLessons, onCompleteLesson }) => {
  const [activeLesson, setActiveLesson] = useState<{ lesson: Lesson; pathId: string } | null>(null);
  const [currentScreen, setCurrentScreen] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const openLesson = useCallback((lesson: Lesson, pathId: string) => {
    setActiveLesson({ lesson, pathId });
    setCurrentScreen(0);
    setQuizStarted(false);
    setQuizAnswers({});
    setQuizSubmitted(false);
  }, []);

  const closeLesson = useCallback(() => {
    setActiveLesson(null);
  }, []);

  const handleNextScreen = useCallback(() => {
    if (!activeLesson) return;
    const totalScreens = activeLesson.lesson.screens.length;
    if (currentScreen < totalScreens - 1) {
      setCurrentScreen(prev => prev + 1);
    } else {
      setQuizStarted(true);
    }
  }, [activeLesson, currentScreen]);

  const handlePrevScreen = useCallback(() => {
    if (quizStarted) {
      setQuizStarted(false);
      return;
    }
    if (currentScreen > 0) {
      setCurrentScreen(prev => prev - 1);
    }
  }, [currentScreen, quizStarted]);

  const handleSelectAnswer = useCallback((questionIdx: number, answerIdx: number) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [questionIdx]: answerIdx }));
  }, [quizSubmitted]);

  const handleSubmitQuiz = useCallback(() => {
    if (!activeLesson) return;
    setQuizSubmitted(true);
    // Mark lesson complete regardless of answers (educational, not punitive)
    onCompleteLesson(activeLesson.lesson.id);
  }, [activeLesson, onCompleteLesson]);

  const getQuizScore = (): number => {
    if (!activeLesson) return 0;
    let correct = 0;
    activeLesson.lesson.quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) correct++;
    });
    return correct;
  };

  const renderPathCard = (path: LearningPath) => {
    const colors = PATH_COLORS[path.id] || PATH_COLORS.basics;
    const completed = path.completedLessonIds.length;
    const total = path.lessons.length;
    const progress = total > 0 ? completed / total : 0;

    // Find next incomplete lesson
    const nextLesson = path.lessons.find(l => !completedLessons.has(l.id));

    return (
      <TouchableOpacity
        key={path.id}
        style={[styles.pathCard, { borderColor: `${colors.primary}20` }]}
        activeOpacity={0.7}
        onPress={() => nextLesson && openLesson(nextLesson, path.id)}
      >
        <Text style={styles.pathEmoji}>{path.emoji}</Text>
        <Text style={styles.pathTitle}>{path.title}</Text>
        <Text style={styles.pathDesc}>{path.description}</Text>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: colors.primary },
            ]}
          />
        </View>
        <Text style={[styles.progressText, { color: colors.primary }]}>
          {completed}/{total} complete
        </Text>

        {/* Continue button */}
        {nextLesson ? (
          <View style={[styles.continueBtn, { backgroundColor: `${colors.primary}15` }]}>
            <Text style={[styles.continueBtnText, { color: colors.primary }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.continueBtn, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={[styles.continueBtnText, { color: colors.primary }]}>Completed!</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderLessonModal = () => {
    if (!activeLesson) return null;
    const { lesson, pathId } = activeLesson;
    const colors = PATH_COLORS[pathId] || PATH_COLORS.basics;
    const totalScreens = lesson.screens.length;
    const isComplete = completedLessons.has(lesson.id);

    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeLesson} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{lesson.title}</Text>
            <Text style={styles.modalProgress}>
              {quizStarted ? 'Quiz' : `${currentScreen + 1}/${totalScreens}`}
            </Text>
          </View>

          {/* Progress dots */}
          <View style={styles.progressDots}>
            {lesson.screens.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i <= currentScreen && !quizStarted && { backgroundColor: colors.primary },
                ]}
              />
            ))}
            <View
              style={[
                styles.progressDot,
                quizStarted && { backgroundColor: colors.primary },
              ]}
            />
          </View>

          {/* Content */}
          <ScrollView
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContentInner}
          >
            {!quizStarted ? (
              // Lesson screen
              <View style={styles.lessonScreen}>
                <Text style={styles.lessonText}>{lesson.screens[currentScreen]}</Text>
              </View>
            ) : (
              // Quiz
              <View style={styles.quizContainer}>
                <Text style={styles.quizTitle}>Quick Check</Text>
                {lesson.quiz.map((q, qIdx) => (
                  <View key={qIdx} style={styles.quizQuestion}>
                    <Text style={styles.quizQuestionText}>{q.question}</Text>
                    {q.options.map((opt, oIdx) => {
                      const isSelected = quizAnswers[qIdx] === oIdx;
                      const isCorrect = q.correctIndex === oIdx;
                      const showResult = quizSubmitted;

                      let optionStyle = styles.quizOption;
                      let textStyle = styles.quizOptionText;

                      if (showResult && isCorrect) {
                        optionStyle = { ...styles.quizOption, ...styles.quizOptionCorrect };
                        textStyle = { ...styles.quizOptionText, color: '#10B981' };
                      } else if (showResult && isSelected && !isCorrect) {
                        optionStyle = { ...styles.quizOption, ...styles.quizOptionWrong };
                        textStyle = { ...styles.quizOptionText, color: '#EF4444' };
                      } else if (isSelected) {
                        optionStyle = { ...styles.quizOption, ...styles.quizOptionSelected };
                        textStyle = { ...styles.quizOptionText, color: '#60A5FA' };
                      }

                      return (
                        <TouchableOpacity
                          key={oIdx}
                          style={optionStyle}
                          onPress={() => handleSelectAnswer(qIdx, oIdx)}
                          disabled={quizSubmitted}
                        >
                          <Text style={textStyle}>{opt}</Text>
                          {showResult && isCorrect && (
                            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                          )}
                          {showResult && isSelected && !isCorrect && (
                            <Ionicons name="close-circle" size={18} color="#EF4444" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {quizSubmitted && (
                  <View style={styles.quizResult}>
                    <Text style={styles.quizResultText}>
                      {getQuizScore()}/{lesson.quiz.length} correct
                    </Text>
                    <Text style={styles.quizXP}>+{lesson.xpReward} XP earned!</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Navigation buttons */}
          <View style={styles.modalNav}>
            {(currentScreen > 0 || quizStarted) && (
              <TouchableOpacity style={styles.navBtnSecondary} onPress={handlePrevScreen}>
                <Ionicons name="arrow-back" size={18} color="#60A5FA" />
                <Text style={styles.navBtnSecondaryText}>Back</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {!quizStarted ? (
              <TouchableOpacity style={styles.navBtnPrimary} onPress={handleNextScreen}>
                <Text style={styles.navBtnPrimaryText}>
                  {currentScreen < totalScreens - 1 ? 'Next' : 'Take Quiz'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            ) : !quizSubmitted ? (
              <TouchableOpacity
                style={[
                  styles.navBtnPrimary,
                  Object.keys(quizAnswers).length < lesson.quiz.length && { opacity: 0.4 },
                ]}
                onPress={handleSubmitQuiz}
                disabled={Object.keys(quizAnswers).length < lesson.quiz.length}
              >
                <Text style={styles.navBtnPrimaryText}>Submit</Text>
                <Ionicons name="checkmark" size={18} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navBtnPrimary} onPress={closeLesson}>
                <Text style={styles.navBtnPrimaryText}>Done</Text>
                <Ionicons name="checkmark" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Learning Paths</Text>
      <Text style={styles.sectionSubtitle}>Bite-sized lessons to level up your investing</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pathsScroll}
      >
        {paths.map(renderPathCard)}
      </ScrollView>

      {renderLessonModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 16,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
  },
  pathsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  pathCard: {
    width: 180,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  pathEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  pathTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  pathDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 14,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 12,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 8,
  },
  continueBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  modalProgress: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  progressDot: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
  },
  modalContent: {
    flex: 1,
  },
  modalContentInner: {
    padding: 24,
    paddingBottom: 40,
  },
  lessonScreen: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 24,
  },
  lessonText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    lineHeight: 26,
  },

  // Quiz styles
  quizContainer: {
    gap: 20,
  },
  quizTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  quizQuestion: {
    gap: 8,
  },
  quizQuestionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 4,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  quizOptionSelected: {
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(96,165,250,0.06)',
  },
  quizOptionCorrect: {
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  quizOptionWrong: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  quizOptionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  quizResult: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
  },
  quizResultText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  quizXP: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },

  // Navigation buttons
  modalNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
    gap: 12,
  },
  navBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  navBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  navBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(96,165,250,0.08)',
  },
  navBtnSecondaryText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
