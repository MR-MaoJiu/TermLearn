import { getMessages } from '../lib/i18n';
import type { AppData } from '../types';

interface CoursePanelProps {
  data: AppData;
  activeCourseId?: string;
  onImport: () => void;
  onRunCommand: (command: string) => void;
}

export function CoursePanel({ data, activeCourseId, onImport, onRunCommand }: CoursePanelProps) {
  const text = getMessages(data.layout.language);

  return (
    <aside className="course-panel panel">
      <div className="panel-header">
        <span>{text.courses}</span>
        <button onClick={onImport}>{text.import}</button>
      </div>
      {!data.courses.length ? (
        <div className="empty-state">
          <p>{text.noCourses}</p>
          <p>{text.noCoursesDesc}</p>
        </div>
      ) : (
        <div className="course-list">
          {data.courses.map((course) => {
            const syllabus = data.syllabi.find((item) => item.id === course.syllabusId);
            return (
              <section className={course.id === activeCourseId ? 'course-item active' : 'course-item'} key={course.id}>
                <button className="course-title" onClick={() => onRunCommand(`lesson start ${course.id}`)}>
                  <span>{course.title}</span>
                  <small>{course.courseType}</small>
                </button>
                <div className="course-meta">{text.syllabus}: {syllabus?.title || text.unnamedSyllabus}</div>
                <div className="course-actions">
                  <button onClick={() => onRunCommand(`lesson next ${course.id}`)}>{text.learn}</button>
                  <button onClick={() => onRunCommand(`quiz start ${course.id}`)}>{text.practice}</button>
                </div>
                <ul className="knowledge-tree">
                  {course.knowledgeTree.slice(0, 4).map((node) => (
                    <li key={node.title}>
                      <span>{node.title}</span>
                      <small>{node.children.length} {text.itemUnit}</small>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <div className="panel-footer">
        <button onClick={() => onRunCommand('syllabus list')}>syllabus list</button>
      </div>
    </aside>
  );
}
