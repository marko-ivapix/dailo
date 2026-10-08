"""Static V1.6 Notes and Resources editor contract."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def test_knowledge_editor_uses_name_and_requires_a_source_for_both_views():
    source = read('js/knowledge.js')
    assert "tr('Name')}<input id=\"knowledge-title\"" in source
    assert "tr('Notes need a Name and at least one URL, image, or attached file.')" in source
    assert "tr('Resources need a Name and at least one URL, image, or attached file.')" in source
    assert "type === 'note' ? tr('Body') : tr('Description')" in source


def test_notes_and_resources_keep_separate_routes_and_shared_delete_undo_flow():
    source = read('js/knowledge.js')
    app = read('js/app.js')
    assert "route.type === 'notes' || route.type === 'resources'" in source
    assert "route.type === 'note' || route.type === 'resource'" in source
    assert "requestDeleteEntity(el.dataset.ownerType, el.dataset.ownerId)" in source
    assert "note: 'notes', resource: 'resources'" in app
    assert "note: msg('Note deleted'), resource: msg('Resource deleted')" in app
    assert "setUndo(deletedMessage," in app


def test_knowledge_attachment_reads_use_the_owner_snapshot_pipeline():
    app = read('js/app.js')
    storage = read('js/storage.js')
    assert 'TodoStorage.knowledgeAttachmentSnapshot({ ...owner.item, type: owner.type })' in app
    assert 'function knowledgeAttachmentSnapshot(record)' in storage


if __name__ == '__main__':
    test_knowledge_editor_uses_name_and_requires_a_source_for_both_views()
    test_notes_and_resources_keep_separate_routes_and_shared_delete_undo_flow()
    test_knowledge_attachment_reads_use_the_owner_snapshot_pipeline()
    print('PASS: V1.6 knowledge static scenarios 3/3')
