import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import LandingView from '@/views/LandingView.vue'
import ConversationView from '@/views/ConversationView.vue'
import DocumentView from '@/views/DocumentView.vue'
import KnowledgeView from '@/views/KnowledgeView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/landing', name: 'landing', component: LandingView },
    { path: '/knowledge-bases', name: 'knowledge-bases', component: HomeView },
    {
      path: '/knowledge-bases/:knowledgeBaseId/documents',
      name: 'documents',
      component: DocumentView,
    },
    {
      path: '/knowledge-bases/:knowledgeBaseId/chat',
      name: 'conversation',
      component: ConversationView,
    },
    {
      path: '/knowledge-bases/:knowledgeBaseId/knowledge',
      name: 'knowledge',
      component: KnowledgeView,
    },
    {
      path: '/knowledge-bases/:knowledgeBaseId/knowledge/:entryId',
      name: 'knowledge-detail',
      component: () => import('@/views/KnowledgeDetailView.vue'),
    },
    {
      path: '/knowledge-bases/:knowledgeBaseId/map',
      name: 'knowledge-map',
      component: () => import('@/views/KnowledgeMapView.vue'),
    },
  ],
})
